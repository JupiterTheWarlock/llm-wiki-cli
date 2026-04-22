import type { WikiPage } from './wiki.js';

// CJK Unicode ranges
const CJK_RE = /[一-鿿㐀-䶿豈-﫿　-〿぀-ゟ゠-ヿ가-힯]/;

const STOP_WORDS = new Set([
  "的", "是", "了", "什么", "在", "有", "和", "与", "对", "从",
  "the", "is", "a", "an", "what", "how", "are", "was", "were",
  "do", "does", "did", "be", "been", "being", "have", "has", "had",
  "it", "its", "in", "on", "at", "to", "for", "of", "with", "by",
  "this", "that", "these", "those",
]);

export function tokenize(text: string): string[] {
  // Split by whitespace and CJK/English punctuation
  const rawTokens = text
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）()\-_/\\·~～…]+/)
    .filter(t => t.length > 1)
    .filter(t => !STOP_WORDS.has(t));

  const tokens: string[] = [];

  for (const token of rawTokens) {
    const hasCJK = CJK_RE.test(token);

    if (hasCJK && token.length > 2) {
      const chars = [...token];
      // Overlapping bigrams
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1]);
      }
      // Individual chars (filtered by stop words)
      for (const ch of chars) {
        if (!STOP_WORDS.has(ch)) {
          tokens.push(ch);
        }
      }
      // Original token for exact match
      tokens.push(token);
    } else {
      tokens.push(token);
    }
  }

  return [...new Set(tokens)];
}

interface BM25Index {
  /** Document frequency: token → number of docs containing it */
  df: Map<string, number>;
  /** Term frequency per doc: docIndex → token → count */
  tf: Map<number, Map<string, number>>;
  /** Document lengths (in tokens) */
  docLengths: number[];
  /** Average document length */
  avgDl: number;
  /** Total documents */
  n: number;
}

function buildIndex(pages: WikiPage[]): BM25Index {
  const df = new Map<string, number>();
  const tf = new Map<number, Map<string, number>>();
  const docLengths: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const text = `${page.title} ${page.description ?? ''} ${page.content}`;
    const tokens = tokenize(text);
    docLengths.push(tokens.length);

    const termFreq = new Map<string, number>();
    const seenTerms = new Set<string>();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
      seenTerms.add(token);
    }

    tf.set(i, termFreq);
    for (const term of seenTerms) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const totalLen = docLengths.reduce((a, b) => a + b, 0);
  const avgDl = pages.length > 0 ? totalLen / pages.length : 0;

  return { df, tf, docLengths, avgDl, n: pages.length };
}

const K1 = 1.2;
const B = 0.75;

function scoreBM25(index: BM25Index, queryTokens: string[], docIdx: number): number {
  let score = 0;
  const docTf = index.tf.get(docIdx);
  if (!docTf) return 0;
  const dl = index.docLengths[docIdx];

  for (const token of queryTokens) {
    const docFreq = index.df.get(token) ?? 0;
    if (docFreq === 0) continue;

    const idf = Math.log((index.n - docFreq + 0.5) / (docFreq + 0.5) + 1);
    const termFreq = docTf.get(token) ?? 0;
    const tfNorm = (termFreq * (K1 + 1)) / (termFreq + K1 * (1 - B + B * dl / index.avgDl));
    score += idf * tfNorm;
  }

  return score;
}

export interface SearchResult {
  page: WikiPage;
  score: number;
}

export function bm25Search(pages: WikiPage[], query: string, limit: number = 10): SearchResult[] {
  if (pages.length === 0) return [];

  const index = buildIndex(pages);
  const queryTokens = tokenize(query);

  const results: SearchResult[] = [];
  for (let i = 0; i < pages.length; i++) {
    const score = scoreBM25(index, queryTokens, i);
    if (score > 0) {
      results.push({ page: pages[i], score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Reciprocal Rank Fusion (RRF) — merges ranked lists from different search methods.
 * K=60 is the standard constant.
 */
export function rrfMerge(
  bm25Results: { slug: string; score: number }[],
  vectorResults: { slug: string; score: number }[],
  limit: number,
  k: number = 60
): { slug: string; score: number }[] {
  const scores = new Map<string, number>();

  for (let i = 0; i < bm25Results.length; i++) {
    const slug = bm25Results[i].slug;
    scores.set(slug, (scores.get(slug) ?? 0) + 1 / (k + i + 1));
  }

  for (let i = 0; i < vectorResults.length; i++) {
    const slug = vectorResults[i].slug;
    scores.set(slug, (scores.get(slug) ?? 0) + 1 / (k + i + 1));
  }

  return [...scores.entries()]
    .map(([slug, score]) => ({ slug, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Snippet builder — ported from nashsu search.ts
const SNIPPET_CONTEXT = 80;

export function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx === -1) return content.slice(0, SNIPPET_CONTEXT * 2).replace(/\n/g, ' ');

  const start = Math.max(0, idx - SNIPPET_CONTEXT);
  const end = Math.min(content.length, idx + query.length + SNIPPET_CONTEXT);
  let snippet = content.slice(start, end).replace(/\n/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}
