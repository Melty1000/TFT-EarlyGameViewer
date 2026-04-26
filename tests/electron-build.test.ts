import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readPackageJson() {
  return JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
    build: {
      win: {
        target: Array<{ target: string; arch: string | string[] }>;
      };
      nsis?: Record<string, unknown>;
      portable?: Record<string, unknown>;
    };
  };
}

describe("Electron distribution config", () => {
  it("ships the portable executable by default and keeps installer packaging explicit", () => {
    const packageJson = readPackageJson();
    const targets = packageJson.build.win.target.map((target) => target.target);

    expect(packageJson.scripts["electron:build"]).toContain("portable");
    expect(packageJson.scripts["electron:build"]).not.toContain("nsis");
    expect(packageJson.scripts["electron:build:installer"]).toContain("nsis");
    expect(packageJson.scripts["electron:build"]).not.toContain("zip");
    expect(targets).toEqual(["nsis", "portable"]);
    expect(packageJson.build.portable).toBeUndefined();
    expect(packageJson.build.nsis?.oneClick).toBe(false);
  });
});
