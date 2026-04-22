import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { listMarkdownFiles } from './wiki.js';

export interface SyncEntry {
  path: string;
  mtime: number;
  contentHash: string;
  lastSynced: string;
}

export interface SyncState {
  entries: Record<string, SyncEntry>;
  lastSync: string;
}

export function loadSyncState(statePath: string): SyncState {
  if (!existsSync(statePath)) {
    return { entries: {}, lastSync: '' };
  }
  return JSON.parse(readFileSync(statePath, 'utf-8'));
}

export function saveSyncState(statePath: string, state: SyncState): void {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function contentHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export interface SyncResult {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
}

/**
 * Compare current wiki/sources state against saved sync state.
 * Returns lists of changed files.
 */
export function computeSync(
  dirs: string[],
  baseDir: string,
  state: SyncState
): SyncResult {
  const result: SyncResult = { added: [], modified: [], deleted: [], unchanged: [] };
  const currentFiles = new Set<string>();

  for (const dir of dirs) {
    for (const filePath of listMarkdownFiles(dir)) {
      const rel = relative(baseDir, filePath);
      currentFiles.add(rel);
      const stat = statSync(filePath);
      const existing = state.entries[rel];

      if (!existing) {
        result.added.push(rel);
      } else if (stat.mtimeMs !== existing.mtime) {
        // mtime changed, check content hash
        const hash = contentHash(filePath);
        if (hash !== existing.contentHash) {
          result.modified.push(rel);
        } else {
          result.unchanged.push(rel);
        }
      } else {
        result.unchanged.push(rel);
      }
    }
  }

  // Check for deleted files
  for (const rel of Object.keys(state.entries)) {
    if (!currentFiles.has(rel)) {
      result.deleted.push(rel);
    }
  }

  return result;
}

/**
 * Update sync state with current file metadata.
 */
export function updateSyncState(
  dirs: string[],
  baseDir: string,
  state: SyncState
): SyncState {
  const newEntries: Record<string, SyncEntry> = {};
  const now = new Date().toISOString().slice(0, 10);

  for (const dir of dirs) {
    for (const filePath of listMarkdownFiles(dir)) {
      const rel = relative(baseDir, filePath);
      const stat = statSync(filePath);
      newEntries[rel] = {
        path: rel,
        mtime: stat.mtimeMs,
        contentHash: contentHash(filePath),
        lastSynced: now,
      };
    }
  }

  return { entries: newEntries, lastSync: now };
}
