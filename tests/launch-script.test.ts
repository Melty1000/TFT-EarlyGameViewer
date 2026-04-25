import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("portable launch script", () => {
  it("is repo-relative, dependency-aware, and strict-port by default", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const script = read("scripts/launch-dev.mjs");

    expect(packageJson.scripts.launch).toBe("node scripts/launch-dev.mjs");
    expect(script).toContain("DEFAULT_PORT = 3002");
    expect(script).toContain("--strictPort");
    expect(script).toContain("npm install");
    expect(script).toContain("node_modules");
    expect(script).toContain("fileURLToPath(import.meta.url)");
    expect(script).not.toMatch(/D:\\|C:\\|HYPNO|Codex-CLI/);
  });

  it("keeps the double-click Windows launcher visible through fresh installs", () => {
    const launcher = read("Launch TFT Early Game Viewer.cmd");

    expect(launcher).toContain("set \"ROOT=%~dp0\"");
    expect(launcher).toContain("call npm run launch");
    expect(launcher).toContain("This window must stay open");
    expect(launcher).toContain("AddMinutes(5)");
    expect(launcher).toContain("pause");
    expect(launcher).not.toContain("start \"TFT Early Game Viewer Dev Server\"");
    expect(launcher).not.toContain("AddSeconds(30)");
    expect(launcher).not.toMatch(/D:\\|C:\\|HYPNO|Codex-CLI/);
  });
});
