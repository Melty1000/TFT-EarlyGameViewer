import { describe, expect, it } from "vitest";
import generatedDataset from "../src/data/tft-set17.json";
import {
  getCompletedItemRecipeGroups,
  getDetailPanelGuideGroups,
  getLevellingGuideSection
} from "../src/lib/detailPanelContent";
import { datasetSchema } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);
const nova = dataset.comps.find((comp) => comp.id === "tftflow-tftflow-2-n-o-v-a");

describe("detail panel content mapping", () => {
  it("keeps TFTFlow overview compact and moves provider notes into game plan", () => {
    expect(nova).toBeDefined();
    if (!nova) {
      return;
    }

    const groups = getDetailPanelGuideGroups(nova, "late");

    expect(groups.overview.map((section) => section.title)).toEqual(["General info"]);
    expect(groups.overview.flatMap((section) => section.lines).join(" ")).not.toContain("TFTFlow tips");
    expect(groups.gamePlan.map((section) => section.title)).toEqual(["When to make", "How to play", "Additional comp tips"]);
    expect(groups.gamePlan.flatMap((section) => section.lines).join(" ")).toContain("N.O.V.A. Emblem");
  });

  it("selects TFTFlow provider leveling from the dedicated guide section", () => {
    expect(nova).toBeDefined();
    if (!nova) {
      return;
    }

    const section = getLevellingGuideSection(nova, "late");

    expect(section?.title).toBe("Levelling guide");
    expect(section?.lines[0]).toBe("Level to 4 if you have upgrades and a good item to place on one of those upgrades.");
    expect(section?.lines).toHaveLength(12);
  });

  it("builds completed item recipe groups for source item panels", () => {
    expect(nova).toBeDefined();
    if (!nova) {
      return;
    }

    const groups = getCompletedItemRecipeGroups(nova, dataset, "late");
    const handOfJustice = groups.find((group) => group.item.id === "hand-of-justice");

    expect(handOfJustice?.count).toBe(2);
    expect(handOfJustice?.recipe.map((item) => item.name)).toEqual(["Glove", "Tear"]);
    expect(groups.some((group) => group.recipe.length === 2)).toBe(true);
  });
});
