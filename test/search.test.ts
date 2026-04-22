import { describe, it, expect } from 'vitest';
import { tokenize, bm25Search, buildSnippet } from '../src/lib/search.js';
import type { WikiPage } from '../src/lib/wiki.js';

function makePage(slug: string, title: string, content: string, overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    path: `wiki/${slug}.md`,
    relativePath: `${slug}.md`,
    slug,
    title,
    content,
    tags: [],
    sources: [],
    aliases: [],
    wikilinks: [],
    mtime: Date.now(),
    ...overrides,
  };
}

describe('tokenize', () => {
  it('should tokenize English text', () => {
    const tokens = tokenize('Hello World');
    expect(tokens).toEqual(['hello', 'world']);
  });

  it('should handle CJK bigrams', () => {
    const tokens = tokenize('分布式共识');
    expect(tokens).toContain('分');
    expect(tokens).toContain('分布');
    expect(tokens).toContain('布');
    expect(tokens).toContain('布式');
    expect(tokens).toContain('式');
    expect(tokens).toContain('式共');
    expect(tokens).toContain('共');
    expect(tokens).toContain('共识');
    expect(tokens).toContain('识');
    // Original token also included
    expect(tokens).toContain('分布式共识');
  });

  it('should handle mixed CJK and English', () => {
    const tokens = tokenize('Raft 共识算法');
    expect(tokens).toContain('raft');
    expect(tokens).toContain('共识');
    expect(tokens).toContain('算法');
  });

  it('should handle empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('should filter stop words', () => {
    const tokens = tokenize('the quick brown fox');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
  });

  it('should filter CJK stop words', () => {
    const tokens = tokenize('这是 什么 问题');
    // "什么" should be filtered, "问题" kept
    expect(tokens).not.toContain('什么');
    expect(tokens).toContain('问题');
  });

  it('should split on CJK punctuation', () => {
    const tokens = tokenize('共识算法，分布式系统。负载均衡');
    expect(tokens).toContain('共识');
    expect(tokens).toContain('负载');
    expect(tokens).toContain('均衡');
    // After splitting on ，each segment is processed independently
    // "共识算法" → bigrams: 共识, 识算, 算法 + chars + original
    // "分布式系统" → bigrams: 分布, 布式, 式系, 系统 + chars + original
    expect(tokens).toContain('分布式系统');
  });

  it('should deduplicate tokens', () => {
    const tokens = tokenize('hello hello');
    // After dedup, 'hello' appears only once
    const helloCount = tokens.filter(t => t === 'hello').length;
    expect(helloCount).toBe(1);
  });
});

describe('bm25Search', () => {
  const pages: WikiPage[] = [
    makePage('raft', 'Raft', 'Raft is a consensus algorithm for distributed systems.'),
    makePage('paxos', 'Paxos', 'Paxos is the original consensus algorithm by Lamport.'),
    makePage('javascript', 'JavaScript', 'JavaScript is a programming language for the web.'),
  ];

  it('should find relevant pages', () => {
    const results = bm25Search(pages, 'consensus algorithm');
    expect(results.length).toBe(2);
    expect(results.map(r => r.page.slug)).toContain('raft');
    expect(results.map(r => r.page.slug)).toContain('paxos');
  });

  it('should not match irrelevant pages', () => {
    const results = bm25Search(pages, 'consensus algorithm');
    expect(results.map(r => r.page.slug)).not.toContain('javascript');
  });

  it('should rank by relevance', () => {
    const results = bm25Search(pages, 'raft');
    expect(results[0].page.slug).toBe('raft');
  });

  it('should return empty for no matches', () => {
    const results = bm25Search(pages, 'quantum computing');
    expect(results).toEqual([]);
  });

  it('should respect limit', () => {
    const results = bm25Search(pages, 'algorithm', 1);
    expect(results.length).toBe(1);
  });

  it('should handle empty pages', () => {
    const results = bm25Search([], 'test');
    expect(results).toEqual([]);
  });

  it('should search CJK content', () => {
    const cjkPages = [
      makePage('consensus-zh', '共识算法', '共识算法是分布式系统的核心问题'),
      makePage('web-zh', 'Web开发', 'JavaScript 是 Web 开发的主要语言'),
    ];
    const results = bm25Search(cjkPages, '共识');
    expect(results.length).toBe(1);
    expect(results[0].page.slug).toBe('consensus-zh');
  });
});

describe('buildSnippet', () => {
  it('should return snippet with query context', () => {
    const content = 'a '.repeat(100) + 'AI Agent is a key concept' + ' b'.repeat(100);
    const snippet = buildSnippet(content, 'AI Agent');
    expect(snippet).toContain('AI Agent');
    expect(snippet).toContain('...');
  });

  it('should return beginning of content when query not found', () => {
    const content = 'This is some content without the query term. '.repeat(10);
    const snippet = buildSnippet(content, 'nonexistent');
    expect(snippet).not.toContain('...');
    expect(snippet.length).toBeLessThan(content.length);
  });

  it('should handle short content', () => {
    const snippet = buildSnippet('Short text', 'Short');
    expect(snippet).toBe('Short text');
  });

  it('should be case-insensitive', () => {
    const content = 'The AI agent helps with tasks';
    const snippet = buildSnippet(content, 'ai agent');
    expect(snippet).toContain('AI agent');
  });
});
