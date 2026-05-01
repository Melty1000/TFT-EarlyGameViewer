#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";
const electronBin = path.join(
  repoRoot,
  "node_modules",
  "electron",
  "dist",
  isWindows ? "electron.exe" : "Electron"
);

const devUrl = process.env.OPNR_DEV_URL ?? "http://127.0.0.1:3002/";

if (!existsSync(electronBin)) {
  console.error("Electron is not installed. Run npm install first.");
  process.exit(1);
}

const child = spawn(electronBin, ["."], {
  cwd: repoRoot,
  env: {
    ...process.env,
    OPNR_DEV_URL: devUrl
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
