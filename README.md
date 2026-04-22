# llm-wiki-cli

Agent-native persistent knowledge management CLI — compile knowledge once, query forever.

LLM Wiki is a CLI tool that creates and manages an **AI-maintained knowledge base** using Obsidian-compatible Markdown files. It provides search, graph analysis, sync tracking, and a skill system for AI coding agents (Claude Code, Codex) to autonomously ingest, query, and maintain your wiki.

Based on [jackwener/llm-wiki](https://github.com/jackwener/llm-wiki).

## Install

```bash
npm install -g @jupiterthewarlock/llm-wiki
```

Requires Node.js >= 20.

## Quick Start

```bash
mkdir my-wiki && cd my-wiki
llm-wiki init
```

This creates the vault structure:

```
my-wiki/
  wiki/                # AI-maintained wiki pages (Obsidian-compatible)
  sources/             # Raw source documents, date-partitioned
  .llm-wiki/           # Config and sync state
  .claude/skills/      # Skills for Claude Code
  .agents/skills/      # Skills for Codex/OpenAI
  wiki-purpose.md      # Wiki scope and audience definition
  wiki-schema.md       # Page types, naming conventions, frontmatter schema
  wiki-agent.md        # Agent identity and ingest rules
  wiki-log.md          # Append-only operation log
  CLAUDE.md            # Claude Code bootstrap instructions
  AGENTS.md            # Codex/OpenAI bootstrap instructions
```

## CLI Reference

### `llm-wiki init [directory]`

Initialize a new wiki vault.

| Option | Description |
|--------|-------------|
| `[directory]` | Directory to initialize (default: `.`) |
| `--existing` | Adopt an existing directory without overwriting files |
| `--language <lang>` | Vault language: `en` or `zh` (default: `en`) |

### `llm-wiki search <query>`

Search wiki pages using BM25 keyword search. When DB9 is configured, also runs vector similarity search and merges results via Reciprocal Rank Fusion (RRF).

| Option | Description |
|--------|-------------|
| `-n, --limit <number>` | Max results (default: `10`) |
| `--bm25-only` | Skip DB9 vector search even if configured |

Output includes slug, title, description, snippet, score, and tags for each result. Supports English and CJK (Chinese/Japanese/Korean) tokenization.

### `llm-wiki graph`

Analyze the wikilink graph. Detects communities (label propagation), hub pages, orphan pages (no incoming links), and wanted pages (linked but not yet created).

| Option | Description |
|--------|-------------|
| `--json` | Output analysis as JSON |

### `llm-wiki status`

Show vault statistics and health summary: page count, source count, link count, log entries, last sync time, recently modified pages, and health checks (missing files, broken links, pages without sources, legacy filename detection).

### `llm-wiki sync`

Track file changes and update sync state using mtime + SHA-256 content hash. Reports added, modified, deleted, and unchanged files. Auto-appends a sync summary to `wiki-log.md`. When DB9 is configured, upserts/deletes embeddings for changed pages.

| Option | Description |
|--------|-------------|
| `--dry-run` | Show changes without updating state |

### `llm-wiki log <verb> <subject>`

Append a structured entry to `wiki-log.md`.

| Option | Description |
|--------|-------------|
| `-d, --detail <text>` | Additional detail line (repeatable) |
| `--max <n>` | Max log entries to keep (default: `200`) |

```bash
llm-wiki log ingest "readme-design-patterns.md" -d "created 3 wiki pages" -d "added 12 wikilinks"
```

### `llm-wiki skill`

Manage AI agent skills.

| Subcommand | Description |
|------------|-------------|
| `install` | Install/upgrade skills to the workspace |
| `show <name>` | Print raw skill markdown to stdout |
| `list` | List all available skills |

| Install Option | Description |
|----------------|-------------|
| `--claude` | Install to `.claude/skills/` only |
| `--codex` | Install to `.agents/skills/` only |
| `--dir <path>` | Workspace directory (default: cwd) |

Default (no flags) installs to both `.claude/skills/` and `.agents/skills/`.

## Agent Skills

The bundled `llm-wiki` skill provides six AI agent operations:

| Skill | Description |
|-------|-------------|
| `/ingest <path>` | Read a source, extract entities/relationships, create wiki pages with `[[wikilinks]]` |
| `/query <question>` | Search wiki, synthesize answers, optionally write back novel synthesis |
| `/lint` | Health-check sweep for structural, content, and source issues |
| `/research <topic>` | Deep investigation with external sources |
| `/enrich <file>` | Add `[[wikilinks]]` to a wiki page by matching against the wiki index |
| `/graph` | Interpret the knowledge graph: communities, hubs, gaps |

## Configuration

Config is stored at `.llm-wiki/config.toml`:

```toml
[vault]
name = "My Wiki"
language = "en"    # "en" or "zh"

# Optional: DB9 vector search integration
# [db9]
# url = "postgresql://..."
```

The CLI walks up from the current directory to find `.llm-wiki/config.toml` and locate the vault root.

## Wiki Page Format

Each page is a Markdown file with YAML frontmatter:

```markdown
---
title: Page Title
description: One-line summary
aliases: [alternate names]
tags: [domain tags]
sources: [2026-04-22/source-file.md]
created: 2026-04-22
updated: 2026-04-22
---

Page content with [[wikilinks]] to other pages.
```

Pages support `[[target]]` and `[[target|display text]]` wikilink syntax, compatible with Obsidian.

## DB9 Vector Search (Optional)

When a DB9 (PostgreSQL + pgvector) connection is configured, search uses hybrid ranking:

- **BM25** for keyword matching (always available)
- **Vector similarity** via DB9's server-side `embedding()` function (1024-dim)
- **Reciprocal Rank Fusion** (K=60) to merge both result sets

## License

Apache-2.0 — see [LICENSE](LICENSE).
