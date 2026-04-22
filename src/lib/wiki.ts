import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import matter from 'gray-matter';

export interface WikiPage {
  path: string;
  relativePath: string;
  slug: string;
  title: string;
  description?: string;
  tags: string[];
  sources: string[];
  created?: string;
  updated?: string;
  aliases: string[];
  content: string;
  wikilinks: string[];
  mtime: number;
}

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

export function listMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = join(entry.parentPath ?? entry.path, entry.name);
        files.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist
  }
  return files;
}

export function parseWikiPage(filePath: string, wikiDir: string): WikiPage {
  const raw = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const stat = statSync(filePath);
  const rel = relative(wikiDir, filePath);
  const slug = rel.replace(/\.md$/, '');

  return {
    path: filePath,
    relativePath: rel,
    slug,
    title: data.title ?? basename(filePath, '.md'),
    description: data.description,
    tags: Array.isArray(data.tags) ? data.tags : [],
    sources: Array.isArray(data.sources) ? data.sources : [],
    created: data.created,
    updated: data.updated,
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    content,
    wikilinks: extractWikilinks(content),
    mtime: stat.mtimeMs,
  };
}

export function loadWikiPages(wikiDir: string): WikiPage[] {
  return listMarkdownFiles(wikiDir).map(f => parseWikiPage(f, wikiDir));
}
