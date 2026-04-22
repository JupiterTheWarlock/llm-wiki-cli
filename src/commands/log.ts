import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireVaultRoot, vaultPaths } from '../lib/config.js';

const MAX_LOG_ENTRIES = 200;

export const logCommand = new Command('log')
  .description('Append a structured entry to wiki-log.md')
  .argument('<verb>', 'Operation verb (e.g. ingest, fix, edit, sync)')
  .argument('<subject>', 'One-line subject describing the change')
  .option('-d, --detail <text>', 'Additional detail lines (repeatable)', (val: string, prev: string[]) => [...prev, val], [] as string[])
  .option('--max <n>', 'Max entries to keep (default 200)', String(MAX_LOG_ENTRIES))
  .action((verb: string, subject: string, opts: { detail: string[]; max: string }) => {
    const root = requireVaultRoot();
    const paths = vaultPaths(root);
    const maxEntries = parseInt(opts.max, 10) || MAX_LOG_ENTRIES;

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace('T', ' ');

    let entry = `\n## [${timestamp}] ${verb} | ${subject}`;
    for (const line of opts.detail) {
      entry += `\n- ${line}`;
    }
    entry += '\n';

    let content: string;
    if (existsSync(paths.log)) {
      content = readFileSync(paths.log, 'utf-8');
    } else {
      content = '# Change Log\n\nAppend-only record of wiki operations. Format: `[date] verb | subject`\n';
    }

    content += entry;

    // Rotate: trim oldest entries if over max
    const entryRegex = /^## \[/gm;
    const matches = [...content.matchAll(entryRegex)];
    if (matches.length > maxEntries) {
      // Keep header + first maxEntries entries
      const cutIndex = matches[matches.length - maxEntries].index!;
      // Find header end
      const headerEnd = content.indexOf('\n## [') !== -1
        ? content.indexOf('\n## [')
        : content.length;
      const header = content.slice(0, headerEnd).trimEnd();
      const body = content.slice(cutIndex);
      content = header + '\n' + body;
    }

    writeFileSync(paths.log, content, 'utf-8');
    console.log(`Logged: [${timestamp}] ${verb} | ${subject}`);
  });
