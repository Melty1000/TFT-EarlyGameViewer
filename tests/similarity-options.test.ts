import { describe, expect, it } from "vitest";
import generatedDataset from "../src/data/tft-set17.json";
import { getSimilarityEntitySections } from "../src/lib/similarityOptions";
import { datasetSchema } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);

describe("similarity option sections", () => {
  it("shows one canonical Meepsie option", () => {
    const sections = getSimilarityEntitySections(dataset);
    const champions = sections.find((section) => section.kind === "champion")?.options ?? [];
    const meepsies = champions.filter((option) => option.name === "Meepsie");

    expect(meepsies).toHaveLength(1);
    expect(meepsies[0].id).toBe("meepsie");
  });
});
