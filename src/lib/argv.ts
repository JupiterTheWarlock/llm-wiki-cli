import { resolve } from "node:path";

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

export function normalizeProcessArgv(argv: string[], cliPath: string): string[] {
  if (argv.length >= 3 && samePath(argv[2], cliPath)) {
    return [argv[0], cliPath, ...argv.slice(3)];
  }
  return argv;
}
