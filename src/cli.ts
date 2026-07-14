import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initCommand } from "./commands/init.js";
import { normalizeProcessArgv } from "./lib/argv.js";

// Auto-load .env from cwd
const dotEnv = join(process.cwd(), ".env");
if (existsSync(dotEnv)) {
  for (const line of readFileSync(dotEnv, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (/^".*"$|^'.*'$/.test(val)) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
import { searchCommand } from "./commands/search.js";
import { graphCommand } from "./commands/graph.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";
import { skillCommand } from "./commands/skill.js";
import { logCommand } from "./commands/log.js";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

const program = new Command();

program
  .name("llm-wiki")
  .description("Agent-native LLM Wiki — AI-maintained knowledge base")
  .version(version);

program.addCommand(initCommand);
program.addCommand(searchCommand);
program.addCommand(graphCommand);
program.addCommand(statusCommand);
program.addCommand(syncCommand);
program.addCommand(logCommand);
program.addCommand(skillCommand);

program.parse(normalizeProcessArgv(process.argv, fileURLToPath(import.meta.url)));
