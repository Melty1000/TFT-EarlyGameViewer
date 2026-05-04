import { describe, expect, it } from "vitest";
import generatedDataset from "../src/data/tft-set17.json";
import {
  getAssignedItemHolders,
  getDetailPanelGuideGroups,
  getLevellingGuideSection
} from "../src/lib/detailPanelContent";
import { buildInspectorModel } from "../src/components/DetailPane";
import { datasetSchema } from "../shared/tft";

const dataset = datasetSchema.parse(generatedDataset);
const nova = dataset.comps.find((comp) => comp.sources[0]?.name === "tftflow" && /n\.o\.v\.a/i.test(comp.title));

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
    expect(groups.gamePlan.flatMap((section) => section.lines).join(" ")).toContain("TFTFlow published line");
  });

  it("selects TFTFlow provider leveling from the dedicated guide section", () => {
    expect(nova).toBeDefined();
    if (!nova) {
      return;
    }

    const section = getLevellingGuideSection(nova, "late");

    expect(section?.title).toBe("Levelling guide");
    expect(section?.lines.some((line) => /Level to \d/.test(line))).toBe(true);
    expect(section?.lines.length).toBeGreaterThan(5);
  });

  it("builds champion-assigned item holder groups for source item panels", () => {
    expect(nova).toBeDefined();
    if (!nova) {
      return;
    }

    const itemHolders = getAssignedItemHolders(nova, dataset, "late");
    const expectedItemSlots = nova.phases.late.boardSlots.filter((slot) => slot.championId && slot.itemIds.length);
    const recipeEntries = itemHolders.flatMap((holder) =>
      holder.items
        .filter((entry) => entry.recipe.length === 2)
        .map((entry) => ({ holder, entry }))
    );

    expect(itemHolders).toHaveLength(expectedItemSlots.length);
    expect(itemHolders.every((holder) => holder.items.length > 0)).toBe(true);
    expect(recipeEntries.length).toBeGreaterThan(0);
    expect(recipeEntries[0].holder.champion.name).toBeTruthy();
    expect(recipeEntries[0].entry.recipe).toHaveLength(2);
  });

  it("uses dataset recipe ids when rendering emblem recipes", () => {
    const comp = dataset.comps.find((candidate) =>
      candidate.phases.late.boardSlots.some((slot) =>
        slot.itemIds.some((itemId) => /emblem$/i.test(dataset.itemsById[itemId]?.name ?? "") && dataset.itemsById[itemId]?.recipeIds?.length === 2)
      )
    );

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    const emblemHolder = getAssignedItemHolders(comp, dataset, "late").find((holder) =>
      holder.items.some((entry) => /emblem$/i.test(entry.item.name) && entry.recipe.length === 2)
    );
    const emblemEntry = emblemHolder?.items.find((entry) => /emblem$/i.test(entry.item.name) && entry.recipe.length === 2);
    const recipeIds = emblemEntry?.recipe.map((item) => item.id) ?? [];

    expect(emblemEntry).toBeDefined();
    expect(recipeIds.some((itemId) => itemId === "spatula" || itemId === "frying-pan")).toBe(true);
    expect(emblemEntry?.recipe).toHaveLength(2);
  });

  it("prefers Mobalytics champion-level recommended items in the inspector", () => {
    const clonedDataset = datasetSchema.parse(JSON.parse(JSON.stringify(generatedDataset)));
    const comp = clonedDataset.comps.find((candidate) =>
      candidate.phases.late.boardSlots.some((slot) => slot.championId && slot.itemIds.length > 0)
    );

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    const slot = comp.phases.late.boardSlots.find((candidate) => candidate.championId && candidate.itemIds.length > 0);
    expect(slot?.championId).toBeDefined();
    if (!slot?.championId) {
      return;
    }

    const recommendedItemIds = ["deathblade", "gargoyle-stoneplate"].filter((itemId) => clonedDataset.itemsById[itemId]);
    expect(recommendedItemIds).toHaveLength(2);

    (clonedDataset.championsById[slot.championId] as { recommendedItemIds?: string[] }).recommendedItemIds =
      recommendedItemIds;
    slot.itemIds = ["warmog-s-armor"].filter((itemId) => clonedDataset.itemsById[itemId]);

    const model = buildInspectorModel(comp, clonedDataset, "late", { kind: "champion", id: slot.championId });

    expect(model?.recommendedItems?.map((item) => item.id)).toEqual(recommendedItemIds);
  });
});
