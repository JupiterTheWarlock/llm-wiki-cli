import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * SHA256-based ingest cache for CLI.
 * Ports nashsu's ingest-cache.ts to Node.js synchronous APIs.
 * Stores hash of source file content → skips re-ingest if unchanged.
 */

interface CacheEntry {
  hash: string;
  timestamp: number;
  filesWritten: string[];
}

interface CacheData {
  entries: Record<string, CacheEntry>;
}

function contentHash(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

function cachePath(vaultRoot: string): string {
  return join(vaultRoot, '.llm-wiki', 'ingest-cache.json');
}

function loadCache(vaultRoot: string): CacheData {
  const p = cachePath(vaultRoot);
  if (!existsSync(p)) return { entries: {} };
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return { entries: {} };
  }
}

function saveCache(vaultRoot: string, cache: CacheData): void {
  try {
    writeFileSync(cachePath(vaultRoot), JSON.stringify(cache, null, 2));
  } catch {
    // non-critical
  }
}

/**
 * Check if a source file has already been ingested with the same content.
 * Returns the list of previously written files if cached, or null if ingest
 * is needed.
 *
 * A cache hit is only returned if every previously-written file still exists
 * on disk. Otherwise the cache is treated as stale.
 */
export function checkIngestCache(
  vaultRoot: string,
  sourceFileName: string,
  sourceContent: string,
): string[] | null {
  const cache = loadCache(vaultRoot);
  const entry = cache.entries[sourceFileName];
  if (!entry) return null;

  const currentHash = contentHash(sourceContent);
  if (entry.hash !== currentHash) return null;

  for (const filePath of entry.filesWritten) {
    const fullPath = isAbsolute(filePath)
      ? resolve(filePath)
      : join(vaultRoot, filePath);
    if (!existsSync(fullPath)) {
      console.log(
        `[ingest-cache] cache miss for ${sourceFileName}: ${filePath} no longer on disk`,
      );
      return null;
    }
  }

  return entry.filesWritten;
}

/**
 * Save ingest result to cache after successful ingest.
 */
export function saveIngestCache(
  vaultRoot: string,
  sourceFileName: string,
  sourceContent: string,
  filesWritten: string[],
): void {
  const cache = loadCache(vaultRoot);
  const hash = contentHash(sourceContent);
  const newEntries = { ...cache.entries };
  newEntries[sourceFileName] = {
    hash,
    timestamp: Date.now(),
    filesWritten,
  };
  saveCache(vaultRoot, { entries: newEntries });
}

/**
 * Remove a source file entry from cache (e.g., when source is deleted).
 */
export function removeFromIngestCache(
  vaultRoot: string,
  sourceFileName: string,
): void {
  const cache = loadCache(vaultRoot);
  const newEntries = { ...cache.entries };
  delete newEntries[sourceFileName];
  saveCache(vaultRoot, { entries: newEntries });
}
