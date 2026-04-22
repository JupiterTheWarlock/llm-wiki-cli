import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { requireVaultRoot, vaultPaths, loadConfig } from '../lib/config.js';
import { computeSync, loadSyncState, saveSyncState, updateSyncState, contentHash } from '../lib/sync.js';
import { checkIngestCache, removeFromIngestCache } from '../lib/ingest-cache.js';
import { createDB9Client } from '../lib/db9.js';
import { parseWikiPage } from '../lib/wiki.js';

const MAX_LOG_ENTRIES = 200;

function appendSyncLog(logPath: string, result: { added: string[]; modified: string[]; deleted: string[] }): void {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const total = result.added.length + result.modified.length + result.deleted.length;

  let entry = `\n## [${timestamp}] sync | ${total} changes (+${result.added.length} ~${result.modified.length} -${result.deleted.length})`;
  if (result.added.length > 0) {
    entry += '\n### Added';
    for (const f of result.added) entry += `\n- ${f}`;
  }
  if (result.modified.length > 0) {
    entry += '\n### Modified';
    for (const f of result.modified) entry += `\n- ${f}`;
  }
  if (result.deleted.length > 0) {
    entry += '\n### Deleted';
    for (const f of result.deleted) entry += `\n- ${f}`;
  }
  entry += '\n';

  let content: string;
  if (existsSync(logPath)) {
    content = readFileSync(logPath, 'utf-8');
  } else {
    content = '# Change Log\n\nAppend-only record of wiki operations. Format: `[date] verb | subject`\n';
  }

  content += entry;

  // Rotate: trim oldest entries if over max
  const entryRegex = /^## \[/gm;
  const matches = [...content.matchAll(entryRegex)];
  if (matches.length > MAX_LOG_ENTRIES) {
    const cutIndex = matches[matches.length - MAX_LOG_ENTRIES].index!;
    const headerEnd = content.indexOf('\n## [') !== -1
      ? content.indexOf('\n## [')
      : content.length;
    const header = content.slice(0, headerEnd).trimEnd();
    const body = content.slice(cutIndex);
    content = header + '\n' + body;
  }

  writeFileSync(logPath, content, 'utf-8');
}

export const syncCommand = new Command('sync')
  .description('Track changes and update sync state (mtime + content hash). Syncs embeddings to DB9 if configured.')
  .option('--dry-run', 'show changes without updating state')
  .action(async (opts: { dryRun?: boolean }) => {
    const root = requireVaultRoot();
    const paths = vaultPaths(root);
    const config = loadConfig(root);

    // Ensure .llm-wiki directory exists
    mkdirSync(dirname(paths.syncState), { recursive: true });

    const state = loadSyncState(paths.syncState);

    const scanDirs = [paths.wiki, paths.sources];

    const result = computeSync(scanDirs, root, state);

    const totalChanges = result.added.length + result.modified.length + result.deleted.length;

    if (totalChanges === 0) {
      console.log('Everything up to date.');
      return;
    }

    if (result.added.length > 0) {
      console.log(`Added (${result.added.length}):`);
      for (const f of result.added) console.log(`  + ${f}`);
    }
    if (result.modified.length > 0) {
      console.log(`Modified (${result.modified.length}):`);
      for (const f of result.modified) console.log(`  ~ ${f}`);
    }
    if (result.deleted.length > 0) {
      console.log(`Deleted (${result.deleted.length}):`);
      for (const f of result.deleted) console.log(`  - ${f}`);
    }

    // Ingest cache categorization for sources/ files
    const srcChanged = [...result.added, ...result.modified]
      .filter(f => f.startsWith('sources/'));
    const srcDeleted = result.deleted.filter(f => f.startsWith('sources/'));

    if (srcChanged.length > 0 || srcDeleted.length > 0) {
      const cached: string[] = [];
      const needsIngest: string[] = [];

      for (const rel of srcChanged) {
        try {
          const content = readFileSync(join(root, rel), 'utf-8');
          const fileName = rel.split('/').pop() ?? rel;
          const cachedFiles = checkIngestCache(root, fileName, content);
          if (cachedFiles !== null) {
            cached.push(rel);
          } else {
            needsIngest.push(rel);
          }
        } catch {
          needsIngest.push(rel);
        }
      }

      for (const rel of srcDeleted) {
        const fileName = rel.split('/').pop() ?? rel;
        removeFromIngestCache(root, fileName);
      }

      console.log(`\nIngest status (${cached.length} cached, ${needsIngest.length} needs ingest):`);
      if (cached.length > 0) {
        console.log('  cached:');
        for (const f of cached) console.log(`    = ${f}`);
      }
      if (needsIngest.length > 0) {
        console.log('  needs ingest:');
        for (const f of needsIngest) console.log(`    ! ${f}`);
      }
    }

    console.log(`\nTotal: ${totalChanges} changes, ${result.unchanged.length} unchanged`);

    if (opts.dryRun) {
      console.log('\n(dry run — state not updated)');
      return;
    }

    // Update local sync state
    const newState = updateSyncState(scanDirs, root, state);
    saveSyncState(paths.syncState, newState);
    console.log(`\nSync state updated (${newState.lastSync})`);

    // Auto-append sync log
    appendSyncLog(paths.log, result);

    // Sync to DB9 if configured
    const db9 = createDB9Client(config);
    if (db9) {
      console.log('\nSyncing to DB9...');
      try {
        await db9.ensureSchema();

        // Upsert added/modified wiki pages
        const wikiChanges = [...result.added, ...result.modified]
          .filter(f => f.startsWith('wiki/'));

        for (const rel of wikiChanges) {
          const filePath = join(root, rel);
          const page = parseWikiPage(filePath, paths.wiki);
          const hash = contentHash(filePath);
          await db9.upsertPage(page, hash);
          console.log(`  ↑ ${rel}`);
        }

        // Delete removed wiki pages
        const wikiDeleted = result.deleted.filter(f => f.startsWith('wiki/'));
        for (const rel of wikiDeleted) {
          const slug = rel.replace(/^wiki\//, '').replace(/\.md$/, '');
          await db9.deletePage(slug);
          console.log(`  ✕ ${rel}`);
        }

        const syncedCount = wikiChanges.length + wikiDeleted.length;
        console.log(`DB9 sync complete (${syncedCount} pages)`);
      } catch (err) {
        console.error(`DB9 sync failed: ${err instanceof Error ? err.message : err}`);
      } finally {
        await db9.close();
      }
    }
  });
