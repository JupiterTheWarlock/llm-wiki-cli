import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeSync, updateSyncState } from '../src/lib/sync.js';
import type { SyncState } from '../src/lib/sync.js';
import { checkIngestCache, saveIngestCache, removeFromIngestCache } from '../src/lib/ingest-cache.js';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `llm-wiki-test-${Date.now()}`);
  mkdirSync(join(testDir, 'wiki'), { recursive: true });
  mkdirSync(join(testDir, '.llm-wiki'), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('computeSync', () => {
  it('should detect added files', () => {
    writeFileSync(join(testDir, 'wiki/page-a.md'), '# Page A');
    const emptyState: SyncState = { entries: {}, lastSync: '' };
    const result = computeSync([join(testDir, 'wiki')], testDir, emptyState);
    expect(result.added).toEqual(['wiki/page-a.md']);
    expect(result.modified).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('should detect deleted files', () => {
    const state: SyncState = {
      entries: {
        'wiki/deleted.md': { path: 'wiki/deleted.md', mtime: 0, contentHash: 'abc', lastSynced: '2026-01-01' },
      },
      lastSync: '2026-01-01',
    };
    const result = computeSync([join(testDir, 'wiki')], testDir, state);
    expect(result.deleted).toEqual(['wiki/deleted.md']);
  });

  it('should detect unchanged files', () => {
    const filePath = join(testDir, 'wiki/page.md');
    writeFileSync(filePath, '# Unchanged');
    const state = updateSyncState([join(testDir, 'wiki')], testDir, { entries: {}, lastSync: '' });
    const result = computeSync([join(testDir, 'wiki')], testDir, state);
    expect(result.unchanged).toEqual(['wiki/page.md']);
  });
});

describe('updateSyncState', () => {
  it('should create entries for all files', () => {
    writeFileSync(join(testDir, 'wiki/a.md'), '# A');
    writeFileSync(join(testDir, 'wiki/b.md'), '# B');
    const state = updateSyncState([join(testDir, 'wiki')], testDir, { entries: {}, lastSync: '' });
    expect(Object.keys(state.entries)).toHaveLength(2);
    expect(state.entries['wiki/a.md']).toBeDefined();
    expect(state.entries['wiki/b.md']).toBeDefined();
    expect(state.entries['wiki/a.md'].contentHash).toBeTruthy();
  });
});

describe('ingest-cache', () => {
  it('should return null for uncached source', () => {
    const result = checkIngestCache(testDir, 'new-source.md', 'content');
    expect(result).toBeNull();
  });

  it('should return filesWritten for cached source with existing outputs', () => {
    const sourceContent = 'source content here';
    const filesWritten = ['wiki/entities/Test.md', 'wiki/concepts/TestConcept.md'];
    // Create the output files so existence check passes
    mkdirSync(join(testDir, 'wiki', 'entities'), { recursive: true });
    mkdirSync(join(testDir, 'wiki', 'concepts'), { recursive: true });
    writeFileSync(join(testDir, 'wiki/entities/Test.md'), '# Test');
    writeFileSync(join(testDir, 'wiki/concepts/TestConcept.md'), '# TestConcept');

    saveIngestCache(testDir, 'source.md', sourceContent, filesWritten);
    const result = checkIngestCache(testDir, 'source.md', sourceContent);
    expect(result).toEqual(filesWritten);
  });

  it('should return null when content changed', () => {
    const filesWritten = ['wiki/entities/Test.md'];
    mkdirSync(join(testDir, 'wiki', 'entities'), { recursive: true });
    writeFileSync(join(testDir, 'wiki/entities/Test.md'), '# Test');

    saveIngestCache(testDir, 'source.md', 'original content', filesWritten);
    const result = checkIngestCache(testDir, 'source.md', 'modified content');
    expect(result).toBeNull();
  });

  it('should return null when output files deleted', () => {
    const filesWritten = ['wiki/entities/Deleted.md'];
    mkdirSync(join(testDir, 'wiki', 'entities'), { recursive: true });
    writeFileSync(join(testDir, 'wiki/entities/Deleted.md'), '# Deleted');

    saveIngestCache(testDir, 'source.md', 'content', filesWritten);
    // Delete the output file
    rmSync(join(testDir, 'wiki/entities/Deleted.md'));
    const result = checkIngestCache(testDir, 'source.md', 'content');
    expect(result).toBeNull();
  });

  it('should remove entry from cache', () => {
    saveIngestCache(testDir, 'source.md', 'content', []);
    removeFromIngestCache(testDir, 'source.md');
    const result = checkIngestCache(testDir, 'source.md', 'content');
    expect(result).toBeNull();
  });
});
