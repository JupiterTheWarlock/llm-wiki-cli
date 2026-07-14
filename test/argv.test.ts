import { describe, expect, it } from "vitest";
import { normalizeProcessArgv } from "../src/lib/argv.js";

describe("normalizeProcessArgv", () => {
  it("removes Electron run-as-node duplicate script arguments", () => {
    expect(
      normalizeProcessArgv(
        ["electron.exe", "electron.exe", "C:\\workspace\\dist\\cli.js", "status", "--json"],
        "C:\\workspace\\dist\\cli.js",
      ),
    ).toEqual(["electron.exe", "C:\\workspace\\dist\\cli.js", "status", "--json"]);
  });

  it("keeps regular Node arguments unchanged", () => {
    const argv = ["node.exe", "C:\\workspace\\dist\\cli.js", "status", "--json"];
    expect(normalizeProcessArgv(argv, "C:\\workspace\\dist\\cli.js")).toEqual(argv);
  });
});
