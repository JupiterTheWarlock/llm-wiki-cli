import { Command } from 'commander';
import { requireVaultRoot, vaultPaths } from '../lib/config.js';
import { loadWikiPages } from '../lib/wiki.js';
import { analyzeGraph } from '../lib/graph.js';

export const graphCommand = new Command('graph')
  .description('Analyze wiki link graph — communities, hubs, orphans, wanted pages')
  .option('--json', 'output as JSON')
  .action((opts: { json?: boolean }) => {
    const root = requireVaultRoot();
    const paths = vaultPaths(root);
    const pages = loadWikiPages(paths.wiki);

    if (pages.length === 0) {
      console.log('No wiki pages found.');
      return;
    }

    const analysis = analyzeGraph(pages);

    if (opts.json) {
      console.log(JSON.stringify({
        nodes: analysis.nodes.length,
        edges: analysis.edges.length,
        orphans: analysis.orphans,
        wantedPages: Object.fromEntries(analysis.wantedPages),
        communities: Object.fromEntries(analysis.communities),
        hubs: analysis.hubs.map(h => ({ slug: h.slug, connections: h.linkCount + h.incomingCount })),
      }, null, 2));
      return;
    }

    console.log(`Graph Analysis: ${analysis.nodes.length} pages, ${analysis.edges.length} links\n`);

    // Hubs
    if (analysis.hubs.length > 0) {
      console.log('Top Hub Pages:');
      for (const hub of analysis.hubs.slice(0, 5)) {
        console.log(`  [[${hub.slug}]] — ${hub.linkCount} outgoing, ${hub.incomingCount} incoming`);
      }
      console.log('');
    }

    // Communities
    if (analysis.communities.size > 0) {
      console.log(`Communities (${analysis.communities.size} detected):`);
      let i = 1;
      for (const [, members] of analysis.communities) {
        console.log(`  Cluster ${i}: ${members.join(', ')}`);
        i++;
      }
      console.log('');
    }

    // Orphans
    if (analysis.orphans.length > 0) {
      console.log(`Orphan Pages (${analysis.orphans.length}, no incoming links):`);
      for (const orphan of analysis.orphans) {
        console.log(`  [[${orphan}]]`);
      }
      console.log('');
    }

    // Wanted pages
    if (analysis.wantedPages.size > 0) {
      console.log(`Wanted Pages (${analysis.wantedPages.size}, linked but not created):`);
      for (const [page, linkedFrom] of analysis.wantedPages) {
        console.log(`  [[${page}]] — linked from ${linkedFrom.length} page(s)`);
      }
      console.log('');
    }
  });
