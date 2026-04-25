import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { datasetSchema } from "../shared/tft";
import { validateDataset } from "./pipeline";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = path.join(ROOT_DIR, "public", "data", "tft-set17.json");

async function main() {
  const dataset = datasetSchema.parse(JSON.parse(await fs.readFile(DATASET_PATH, "utf8")));
  const problems = validateDataset(dataset);

  if (problems.length > 0) {
    throw new Error(`Dataset validation failed:\n- ${problems.join("\n- ")}`);
  }

  console.log("Dataset validation passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
