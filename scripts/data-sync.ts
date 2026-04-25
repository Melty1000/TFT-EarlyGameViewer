import { buildDataset, validateDataset, writeDataset } from "./pipeline";

async function main() {
  const dataset = await buildDataset();
  const problems = validateDataset(dataset);

  if (problems.length > 0) {
    throw new Error(`Dataset validation failed:\n- ${problems.join("\n- ")}`);
  }

  const outputPath = await writeDataset(dataset);
  console.log(`Dataset synced to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
