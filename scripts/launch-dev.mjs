#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3002;
const MIN_NODE_MAJOR = 20;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.HOST ?? DEFAULT_HOST;
const port = args.port ?? process.env.PORT ?? String(DEFAULT_PORT);

function parseArgs(rawArgs) {
  const parsed = { install: true };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--no-install") {
      parsed.install = false;
      continue;
    }

    if (arg === "--host") {
      parsed.host = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length);
      continue;
    }

    if (arg === "--port") {
      parsed.port = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      parsed.port = arg.slice("--port=".length);
      continue;
    }
  }

  return parsed;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: isWindows,
    ...options
  });

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function ensureSupportedNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major < MIN_NODE_MAJOR) {
    console.error(`Node ${MIN_NODE_MAJOR}+ is required. Current Node version: ${process.version}`);
    process.exit(1);
  }
}

function hasInstalledDependencies() {
  const viteBin = path.join(repoRoot, "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");
  return existsSync(path.join(repoRoot, "node_modules")) && existsSync(viteBin);
}

ensureSupportedNode();

if (args.install && !hasInstalledDependencies()) {
  console.log("Dependencies are missing. Running npm install...");
  run(npmCommand, ["install"]);
}

console.log(`Launching TFT Early Game Viewer at http://${host}:${port}/`);
run(npmCommand, ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"]);
