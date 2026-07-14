import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "dist", "cli.js");
let vaultDir: string;

function runCli(args: string[]): unknown {
  const stdout = execFileSync(process.execPath, [CLI, ...args], {
    cwd: vaultDir,
    encoding: "utf8",
  });
  return JSON.parse(stdout) as unknown;
}

beforeEach(() => {
  vaultDir = join(tmpdir(), `llm-wiki-json-${process.pid}-${Date.now()}`);
  mkdirSync(join(vaultDir, ".llm-wiki"), { recursive: true });
  mkdirSync(join(vaultDir, "wiki"), { recursive: true });
  mkdirSync(join(vaultDir, "sources"), { recursive: true });
  writeFileSync(
    join(vaultDir, ".llm-wiki", "config.toml"),
    '[vault]\nname = "Test Wiki"\nlanguage = "zh"\n',
  );
  writeFileSync(join(vaultDir, "wiki-purpose.md"), "# Purpose\n");
  writeFileSync(join(vaultDir, "wiki-schema.md"), "# Schema\n");
  writeFileSync(
    join(vaultDir, "wiki", "agent-workbench.md"),
    [
      "---",
      "title: Agent Workbench",
      "description: Personal agent control center",
      "tags: [agent, workbench]",
      "sources: []",
      "---",
      "",
      "A local agent workbench connects [[missing-page]] to daily tools.",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(vaultDir, { recursive: true, force: true });
});

describe("CLI JSON output", () => {
  it("returns structured vault status", () => {
    const output = runCli(["status", "--json"]);

    expect(output).toMatchObject({
      vault: { name: "Test Wiki", language: "zh" },
      counts: { pages: 1, sources: 0, links: 1, logEntries: 0 },
      lastSync: null,
    });
    expect(output).toHaveProperty("recentPages.0.relativePath", "agent-workbench.md");
    expect(output).toHaveProperty("issues.0.code");
  });

  it("returns structured search results with page paths", () => {
    const output = runCli(["search", "workbench", "--bm25-only", "--json"]);

    expect(output).toMatchObject({
      query: "workbench",
      mode: "bm25",
      results: [
        {
          slug: "agent-workbench",
          relativePath: "agent-workbench.md",
          title: "Agent Workbench",
          tags: ["agent", "workbench"],
        },
      ],
    });
  });
});
