import { Command } from "commander";
import { requireVaultRoot, vaultPaths, loadConfig } from "../lib/config.js";
import { loadWikiPages } from "../lib/wiki.js";
import { bm25Search, rrfMerge, buildSnippet } from "../lib/search.js";
import { createDB9Client } from "../lib/db9.js";

export const searchCommand = new Command("search")
  .description("Search wiki pages (BM25 + DB9 vector search if configured)")
  .argument("<query>", "search query")
  .option("-n, --limit <number>", "max results", "10")
  .option("--bm25-only", "force BM25-only search even if DB9 is configured")
  .option("--json", "output as JSON")
  .action(async (query: string, opts: { limit: string; bm25Only?: boolean; json?: boolean }) => {
    const root = requireVaultRoot();
    const paths = vaultPaths(root);
    const config = loadConfig(root);
    const pages = loadWikiPages(paths.wiki);

    if (pages.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ query, mode: "bm25", results: [] }));
        return;
      }
      console.log("No wiki pages found. Use /ingest to add content.");
      return;
    }

    const limit = parseInt(opts.limit, 10);
    const pagesBySlug = new Map(pages.map((p) => [p.slug, p]));

    // BM25 search
    const bm25Results = bm25Search(pages, query, limit * 2);

    // Try DB9 vector search if configured
    const db9 = !opts.bm25Only ? createDB9Client(config) : null;
    let vectorResults: { slug: string; score: number }[] = [];
    let hybridMode = false;

    if (db9) {
      try {
        const dbResults = await db9.vectorSearch(query, limit * 2);
        vectorResults = dbResults.map((r) => ({ slug: r.slug, score: r.similarity }));
        hybridMode = vectorResults.length > 0;
      } catch (err) {
        console.error(
          `DB9 search failed, falling back to BM25: ${err instanceof Error ? err.message : err}`,
        );
      } finally {
        await db9.close();
      }
    }

    let finalResults: { slug: string; score: number }[];

    if (hybridMode) {
      // RRF merge of BM25 + vector results
      finalResults = rrfMerge(
        bm25Results.map((r) => ({ slug: r.page.slug, score: r.score })),
        vectorResults,
        limit,
      );
    } else {
      finalResults = bm25Results
        .slice(0, limit)
        .map((r) => ({ slug: r.page.slug, score: r.score }));
    }

    const mode = hybridMode ? "hybrid" : "bm25";
    const results = finalResults.flatMap(({ slug, score }) => {
      const page = pagesBySlug.get(slug);
      if (!page) return [];
      return [
        {
          slug,
          relativePath: page.relativePath,
          title: page.title,
          description: page.description ?? "",
          snippet: buildSnippet(page.content, query),
          score,
          tags: page.tags,
          sources: page.sources,
        },
      ];
    });

    if (opts.json) {
      console.log(JSON.stringify({ query, mode, results }));
      return;
    }

    console.log(
      hybridMode
        ? `Results for "${query}" (hybrid BM25 + vector, ${finalResults.length} matches):\n`
        : `Results for "${query}" (BM25, ${finalResults.length} matches):\n`,
    );

    if (finalResults.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }

    for (const { slug, score } of finalResults) {
      const page = pagesBySlug.get(slug);
      console.log(`  ${slug}`);
      if (page) {
        console.log(`    Title: ${page.title}`);
        if (page.description) console.log(`    ${page.description}`);
        console.log(`    Snippet: ${buildSnippet(page.content, query)}`);
        console.log(`    Score: ${score.toFixed(4)} | Tags: ${page.tags.join(", ") || "none"}`);
      }
      console.log("");
    }
  });
