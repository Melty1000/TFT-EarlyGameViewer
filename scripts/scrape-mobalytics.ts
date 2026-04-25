import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(ROOT_DIR, "data", "raw");
const OUT_FILE = path.join(RAW_DIR, "mobalytics-live-snapshot.html");

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("https://mobalytics.gg/tft/team-comps", {
      waitUntil: "networkidle",
      timeout: 60_000
    });

    const html = await page.content();
    await fs.writeFile(OUT_FILE, html, "utf8");
    console.log(`Saved Mobalytics snapshot to ${OUT_FILE}`);
    console.log("This script captures a live snapshot for future parser work; the current data:sync command uses local raw inputs.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
