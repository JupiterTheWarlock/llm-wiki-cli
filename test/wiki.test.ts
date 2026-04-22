import { describe, it, expect } from 'vitest';
import { extractWikilinks } from '../src/lib/wiki.js';

describe('extractWikilinks', () => {
  it('should extract simple wikilinks', () => {
    const links = extractWikilinks('See [[raft]] and [[paxos]] for details.');
    expect(links).toEqual(['raft', 'paxos']);
  });

  it('should extract wikilinks with display text', () => {
    const links = extractWikilinks('See [[raft|Raft Algorithm]] for details.');
    expect(links).toEqual(['raft']);
  });

  it('should extract wikilinks with paths', () => {
    const links = extractWikilinks('See [[papers/raft-2014|Raft Paper]].');
    expect(links).toEqual(['papers/raft-2014']);
  });

  it('should deduplicate wikilinks', () => {
    const links = extractWikilinks('[[raft]] is great. See [[raft]] again.');
    expect(links).toEqual(['raft']);
  });

  it('should handle no wikilinks', () => {
    const links = extractWikilinks('No links here.');
    expect(links).toEqual([]);
  });

  it('should handle wikilinks with spaces', () => {
    const links = extractWikilinks('See [[ distributed consensus ]].');
    expect(links).toEqual(['distributed consensus']);
  });

  it('should not extract markdown links', () => {
    const links = extractWikilinks('See [raft](https://raft.github.io).');
    expect(links).toEqual([]);
  });
});
