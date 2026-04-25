import { describe, expect, it } from "vitest";
import generatedDataset from "../public/data/tft-set17.json";
import { datasetSchema } from "../shared/tft";
import { validateDataset } from "../scripts/pipeline";

describe("dataset validation", () => {
  it("accepts the generated dataset", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("flags missing champion references and remote assets", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    dataset.comps[0].phases.late.championIds.push("missing-champion");
    dataset.championsById[Object.keys(dataset.championsById)[0]].icon = "http://example.com/icon.png";

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("missing champion"))).toBe(true);
    expect(problems.some((problem) => problem.includes("Remote asset URL"))).toBe(true);
  });
});
