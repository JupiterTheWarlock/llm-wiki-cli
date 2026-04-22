import { describe, it, expect } from 'vitest';
import { analyzeGraph } from '../src/lib/graph.js';
import type { WikiPage } from '../src/lib/wiki.js';

function makePage(slug: string, wikilinks: string[], aliases: string[] = []): WikiPage {
  return {
    path: `wiki/${slug}.md`,
    relativePath: `${slug}.md`,
    slug,
    title: slug,
    content: '',
    tags: [],
    sources: [],
    aliases,
    wikilinks,
    mtime: Date.now(),
  };
}

describe('analyzeGraph', () => {
  it('should detect edges from wikilinks', () => {
    const pages = [
      makePage('a', ['b', 'c']),
      makePage('b', ['a']),
      makePage('c', []),
    ];
    const result = analyzeGraph(pages);
    expect(result.edges.length).toBe(3);
    expect(result.edges).toContainEqual({ from: 'a', to: 'b' });
    expect(result.edges).toContainEqual({ from: 'a', to: 'c' });
    expect(result.edges).toContainEqual({ from: 'b', to: 'a' });
  });

  it('should detect orphan pages', () => {
    const pages = [
      makePage('a', ['b']),
      makePage('b', []),
      makePage('orphan', []),
    ];
    const result = analyzeGraph(pages);
    expect(result.orphans).toContain('a');
    expect(result.orphans).toContain('orphan');
    expect(result.orphans).not.toContain('b');
  });

  it('should detect wanted pages', () => {
    const pages = [
      makePage('a', ['b', 'nonexistent']),
      makePage('b', ['nonexistent']),
    ];
    const result = analyzeGraph(pages);
    expect(result.wantedPages.has('nonexistent')).toBe(true);
    expect(result.wantedPages.get('nonexistent')!.length).toBe(2);
  });

  it('should identify hub pages', () => {
    const pages = [
      makePage('hub', ['a', 'b', 'c']),
      makePage('a', ['hub']),
      makePage('b', ['hub']),
      makePage('c', []),
    ];
    const result = analyzeGraph(pages);
    expect(result.hubs[0].slug).toBe('hub');
  });

  it('should handle empty graph', () => {
    const result = analyzeGraph([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.orphans).toEqual([]);
  });

  it('should resolve aliases', () => {
    const pages = [
      makePage('raft-algorithm', [], ['raft']),
      makePage('consensus', ['raft']),
    ];
    const result = analyzeGraph(pages);
    expect(result.edges).toContainEqual({ from: 'consensus', to: 'raft-algorithm' });
    expect(result.wantedPages.has('raft')).toBe(false);
  });
});
