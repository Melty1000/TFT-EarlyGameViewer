import { copyFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = path.join(ROOT, "release");
const version = packageJson.version;
const arch = process.env.TAURI_RELEASE_ARCH ?? "x64";

const PORTABLE_ARTIFACT_TEMPLATE = "opnr-gg-${version}-x64-portable.exe";
const SETUP_ARTIFACT_TEMPLATE = "opnr-gg-${version}-x64-setup.exe";

const targetDir = process.env.TAURI_TARGET_TRIPLE
  ? path.join(ROOT, "src-tauri", "target", process.env.TAURI_TARGET_TRIPLE, "release")
  : path.join(ROOT, "src-tauri", "target", "release");

const portableSource = path.join(targetDir, "opnr-gg.exe");
const installerDir = path.join(targetDir, "bundle", "nsis");

function artifactName(template) {
  return template.replace("${version}", version).replace("x64", arch);
}

async function findNsisInstaller() {
  const entries = await readdir(installerDir);
  const installers = entries.filter((entry) => entry.endsWith(".exe") && /setup/i.test(entry));
  if (installers.length === 0) {
    throw new Error(`No NSIS setup executable found in ${installerDir}`);
  }

  return path.join(installerDir, installers.sort()[installers.length - 1]);
}

if (!existsSync(portableSource)) {
  throw new Error(`Tauri portable executable was not found at ${portableSource}`);
}

await mkdir(RELEASE_DIR, { recursive: true });

const portableTarget = path.join(RELEASE_DIR, artifactName(PORTABLE_ARTIFACT_TEMPLATE));
const setupTarget = path.join(RELEASE_DIR, artifactName(SETUP_ARTIFACT_TEMPLATE));

await copyFile(portableSource, portableTarget);
await copyFile(await findNsisInstaller(), setupTarget);

console.log(`wrote ${path.relative(ROOT, portableTarget)}`);
console.log(`wrote ${path.relative(ROOT, setupTarget)}`);
