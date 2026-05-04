import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("Tauri distribution config", () => {
  it("uses Tauri instead of Electron for desktop builds", () => {
    const packageJson = readJson<{
      main?: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      build?: unknown;
    }>("package.json");

    expect(packageJson.main).toBeUndefined();
    expect(packageJson.build).toBeUndefined();
    expect(packageJson.scripts["tauri"]).toBe("tauri");
    expect(packageJson.scripts["tauri:dev"]).toContain("tauri dev");
    expect(packageJson.scripts["tauri:build"]).toContain("tauri build");
    expect(packageJson.scripts["release:build"]).toBe("npm run tauri:build");
    expect(packageJson.scripts["electron:dev"]).toBeUndefined();
    expect(packageJson.scripts["electron:build"]).toBeUndefined();
    expect(packageJson.dependencies["@tauri-apps/api"]).toBeDefined();
    expect(packageJson.dependencies["@tauri-apps/plugin-opener"]).toBeDefined();
    expect(packageJson.devDependencies["@tauri-apps/cli"]).toBeDefined();
    expect(packageJson.devDependencies.electron).toBeUndefined();
    expect(packageJson.devDependencies["electron-builder"]).toBeUndefined();
  });

  it("builds an installed release and a portable executable with the opnr.gg icon", () => {
    const tauriConfig = readJson<{
      productName: string;
      identifier: string;
      build: {
        beforeDevCommand: string;
        beforeBuildCommand: string;
        devUrl: string;
        frontendDist: string;
      };
      app: {
        windows: Array<{
          label: string;
          title: string;
          width: number;
          height: number;
          minWidth: number;
          minHeight: number;
          decorations: boolean;
        }>;
      };
      bundle: {
        active: boolean;
        targets: string[];
        icon: string[];
        windows: {
          nsis: {
            installerIcon: string;
            displayLanguageSelector: boolean;
            installMode: string;
          };
        };
      };
    }>("src-tauri/tauri.conf.json");
    const releaseScript = readFileSync("scripts/package-tauri-release.mjs", "utf8");

    expect(tauriConfig.productName).toBe("opnr.gg");
    expect(tauriConfig.identifier).toBe("gg.opnr.viewer");
    expect(tauriConfig.build.beforeDevCommand).toContain("--strictPort");
    expect(tauriConfig.build.beforeBuildCommand).toBe("npm run build");
    expect(tauriConfig.build.devUrl).toBe("http://127.0.0.1:3002/");
    expect(tauriConfig.build.frontendDist).toBe("../dist");
    expect(tauriConfig.app.windows).toEqual([
      expect.objectContaining({
        label: "main",
        title: "opnr.gg",
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        decorations: false
      })
    ]);
    expect(tauriConfig.bundle.active).toBe(true);
    expect(tauriConfig.bundle.targets).toContain("nsis");
    expect(tauriConfig.bundle.icon).toContain("icons/icon.ico");
    expect(tauriConfig.bundle.icon).toContain("icons/icon.png");
    expect(tauriConfig.bundle.windows.nsis.installerIcon).toBe("icons/icon.ico");
    expect(tauriConfig.bundle.windows.nsis.displayLanguageSelector).toBe(false);
    expect(tauriConfig.bundle.windows.nsis.installMode).toBe("currentUser");
    expect(releaseScript).toContain("portable");
    expect(releaseScript).toContain("opnr-gg-${version}-x64-portable.exe");
    expect(releaseScript).toContain("opnr-gg-${version}-x64-setup.exe");
  });

  it("keeps Tauri icon assets generated from the accepted logo", () => {
    for (const iconPath of [
      "src-tauri/icons/32x32.png",
      "src-tauri/icons/128x128.png",
      "src-tauri/icons/128x128@2x.png",
      "src-tauri/icons/icon.png",
      "src-tauri/icons/icon.ico"
    ]) {
      expect(existsSync(iconPath), iconPath).toBe(true);
    }
  });
});
