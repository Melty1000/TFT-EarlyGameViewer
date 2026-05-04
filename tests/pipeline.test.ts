import { describe, expect, it } from "vitest";
import generatedDataset from "../src/data/tft-set17.json";
import { PHASES } from "../shared/normalization";
import { datasetSchema } from "../shared/tft";
import {
  extractMobalyticsLevelingLines,
  parseTftAcademyDetailTier,
  parseTftAcademyTierMap,
  parseTftflowDetailHtml,
  validateDataset
} from "../scripts/pipeline";

describe("dataset validation", () => {
  it("accepts the generated dataset", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("keeps provider builds separate instead of merged", () => {
    const dataset = datasetSchema.parse(generatedDataset);

    expect(dataset.comps.some((comp) => comp.sources.length > 1)).toBe(false);
    expect(dataset.comps.every((comp) => /\([^)]+\)$/.test(comp.title))).toBe(true);
    expect(dataset.comps.some((comp) => comp.notes?.toLowerCase().includes("merged"))).toBe(false);
  });

  it("rejects comps that merge provider sources", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    dataset.comps[0].sources.push({
      name: "mobalytics",
      url: "https://mobalytics.gg/tft/team-comps",
      evidence: []
    });

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("merged provider builds are not allowed"))).toBe(true);
  });

  it("flags missing champion references and remote assets", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    dataset.comps[0].phases.late.championIds.push("missing-champion");
    dataset.championsById[Object.keys(dataset.championsById)[0]].icon = "http://example.com/icon.png";

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("missing champion"))).toBe(true);
    expect(problems.some((problem) => problem.includes("Remote asset URL"))).toBe(true);
  });

  it("flags board item references without local item records", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    const phase = dataset.comps[0].phases.late;
    const targetSlot = phase.boardSlots.find((slot) => slot.championId);

    expect(targetSlot).toBeDefined();
    if (!targetSlot) {
      return;
    }

    targetSlot.itemIds = ["missing-emblem"];

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("missing item missing-emblem"))).toBe(true);
  });

  it("flags placeholder item icons", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    const firstItemId = Object.keys(dataset.itemsById)[0];
    dataset.itemsById[firstItemId].icon = "assets/items/missingno.png";

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("missing item placeholder"))).toBe(true);
  });

  it("rejects comps without recommended augments", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    dataset.comps[0].recommendedAugmentIds = [];

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("has no recommended augments"))).toBe(true);
  });

  it("uses rendered TFT Academy card ranks, including real X tiers", () => {
    const tierMap = parseTftAcademyTierMap(`
      <a href="/tierlist/comps/set-17-two-tanky-urgot">
        <img alt="X Tier" src="rank-x.svg" />
      </a>
      <a href="/tierlist/comps/set-17-invader-zed">
        <img alt="A Tier" src="rank-a.svg" />
      </a>
      <a href="/tierlist/comps/set-17-bonk-nasus">
        <img alt="B Tier" src="rank-b.svg" />
      </a>
    `);

    expect(tierMap["set-17-two-tanky-urgot"]).toBe("X");
    expect(tierMap["set-17-invader-zed"]).toBe("A");
    expect(tierMap["set-17-bonk-nasus"]).toBe("B");
  });

  it("can fall back to a TFT Academy detail page rank when the list payload omits it", () => {
    expect(parseTftAcademyDetailTier(`<img alt="X Tier" src="rank-x.svg" />`)).toBe("X");
    expect(parseTftAcademyDetailTier(`<img alt="A Tier" src="rank-a.svg" />`)).toBe("A");
  });

  it("keeps TFT Academy X ranks when the source marks a comp as X tier", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const academyRanks = dataset.comps
      .filter((comp) => comp.sources[0]?.name === "tftacademy")
      .map((comp) => comp.sources[0]?.tier);

    expect(academyRanks.filter((rank) => rank === "X").length).toBeGreaterThan(1);
  });

  it("does not ship MetaTFT comps when the provider cannot produce usable build metadata", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const metaComps = dataset.comps.filter((comp) => comp.sources[0]?.name === "metatft");

    expect(metaComps).toHaveLength(0);
  });

  it("does not ship any source comp unless it resolves at least one augment", () => {
    const dataset = datasetSchema.parse(generatedDataset);

    expect(dataset.comps.every((comp) => comp.recommendedAugmentIds.length > 0)).toBe(true);
  });

  it("ships provider-native evidence and provenance for every provider build", () => {
    const dataset = datasetSchema.parse(generatedDataset);

    expect(
      dataset.comps.every((comp) => {
        const source = comp.sources[0];
        return (
          source?.provenance?.provider === source?.name &&
          source.provenance?.url === source.url &&
          source.evidence.some((entry) => entry.kind === "board") &&
          source.evidence.some((entry) => entry.kind === "augment")
        );
      })
    ).toBe(true);
  });

  it("ships board phases only when backed by provider board evidence", () => {
    const dataset = datasetSchema.parse(generatedDataset);

    for (const comp of dataset.comps) {
      const nativeBoardPhases = new Set(
        comp.sources[0]?.evidence
          .filter((entry) => entry.kind === "board" && entry.phase !== "overview")
          .map((entry) => entry.phase) ?? []
      );

      for (const phaseKey of PHASES) {
        if (nativeBoardPhases.has(phaseKey)) {
          expect(comp.phases[phaseKey].championIds.length, `${comp.title} should keep native ${phaseKey} board`).toBeGreaterThan(0);
          continue;
        }

        expect(comp.phases[phaseKey].championIds, `${comp.title} should not forge ${phaseKey} champion ids`).toEqual([]);
        expect(
          comp.phases[phaseKey].boardSlots.filter((slot) => slot.championId),
          `${comp.title} should not forge ${phaseKey} board slots`
        ).toEqual([]);
      }
    }
  });

  it("rejects provider builds without native evidence", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    dataset.comps[0].sources[0].evidence = [];

    const problems = validateDataset(dataset);

    expect(problems.some((problem) => problem.includes("provider-native evidence"))).toBe(true);
  });

  it("rejects phase board data without matching provider board evidence", () => {
    const dataset = datasetSchema.parse(structuredClone(generatedDataset));
    const comp = dataset.comps.find((candidate) =>
      candidate.sources[0]?.evidence.some((entry) => entry.kind === "board" && entry.phase === "late") &&
      candidate.phases.late.championIds.length > 0
    );

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    comp.phases.early = structuredClone(comp.phases.late);
    comp.sources[0].evidence = comp.sources[0].evidence.filter(
      (entry) => !(entry.kind === "board" && entry.phase === "early")
    );

    const problems = validateDataset(dataset);

    expect(
      problems.some((problem) => problem.includes("early phase has board data without provider board evidence"))
    ).toBe(true);
  });

  it("resolves Mobalytics legacy item slugs to current item names", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const usedItemIds = new Set(
      dataset.comps.flatMap((comp) =>
        Object.values(comp.phases).flatMap((phase) => phase.boardSlots.flatMap((slot) => slot.itemIds))
      )
    );

    expect(dataset.itemsById["fimbulwinter"]).toBeUndefined();
    expect(dataset.itemsById["steadfast-hammer"]).toBeUndefined();
    expect(usedItemIds.has("fimbulwinter")).toBe(false);
    expect(usedItemIds.has("steadfast-hammer")).toBe(false);
    expect(usedItemIds.has("protector-s-vow")).toBe(true);
    expect(usedItemIds.has("steadfast-heart")).toBe(true);
  });

  it("ships emblem recipe ids from provider item composition data", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const emblems = Object.values(dataset.itemsById).filter((item) => /emblem$/i.test(item.name));

    expect(emblems.length).toBeGreaterThan(0);
    expect(
      emblems.map((item) => ({
        id: item.id,
        recipeIds: (item as { recipeIds?: string[] }).recipeIds ?? []
      }))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipeIds: expect.arrayContaining(["spatula"])
        })
      ])
    );
    expect(
      emblems
        .map((item) => ((item as { recipeIds?: string[] }).recipeIds ?? []).length)
        .filter((length) => length > 0)
        .every((length) => length === 2)
    ).toBe(true);
  });

  it("ships every current set trait emblem, even when no scraped comp equips it", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const expectedTraitEmblemIds = [
      "anima-emblem",
      "arbiter-emblem",
      "bastion-emblem",
      "brawler-emblem",
      "challenger-emblem",
      "dark-star-emblem",
      "marauder-emblem",
      "meeple-emblem",
      "n-o-v-a-emblem",
      "primordian-emblem",
      "psionic-emblem",
      "rogue-emblem",
      "shepherd-emblem",
      "sniper-emblem",
      "space-groove-emblem",
      "stargazer-emblem",
      "timebreaker-emblem",
      "vanguard-emblem",
      "voyager-emblem"
    ];

    expect(Object.keys(dataset.itemsById)).toEqual(expect.arrayContaining(expectedTraitEmblemIds));
    expect(dataset.itemsById["random-emblem"]).toBeUndefined();
  });

  it("ships Mobalytics champion-level recommended item ids", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const championsWithRecommendedItems = Object.values(dataset.championsById).filter(
      (champion) => ((champion as { recommendedItemIds?: string[] }).recommendedItemIds ?? []).length > 0
    );

    expect(championsWithRecommendedItems.length).toBeGreaterThan(30);
    expect(championsWithRecommendedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "aatrox",
          recommendedItemIds: expect.arrayContaining([
            "gargoyle-stoneplate",
            "bloodthirster",
            "bramble-vest",
            "sunfire-cape",
            "titan-s-resolve"
          ])
        })
      ])
    );
    expect(dataset.championsById.aatrox.recommendedItemIds.length).toBeGreaterThanOrEqual(8);

    for (const champion of championsWithRecommendedItems) {
      for (const itemId of (champion as { recommendedItemIds?: string[] }).recommendedItemIds ?? []) {
        expect(dataset.itemsById[itemId], `${champion.name} recommended item ${itemId}`).toBeDefined();
      }
    }
  });

  it("formats Mobalytics levelling tags with minimum gold", () => {
    expect(
      extractMobalyticsLevelingLines({
        label: "Level 5 Slow Roll",
        slug: "5-slow-roll",
        levelling: [
          { level: 4, stage: "2-1", preserveMoney: 10, description: "Hold pairs" },
          { level: 5, stage: "3-2", preserveMoney: 50, description: "Slowroll for carries" }
        ]
      })
    ).toEqual(["Level 4 at 2-1 with 10+ gold - Hold pairs", "Level 5 at 3-2 with 50+ gold - Slowroll for carries"]);
  });

  it("includes Mobalytics minimum gold in generated levelling guides", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const mobalyticsComp = dataset.comps.find((comp) => comp.sources[0]?.name === "mobalytics");
    const levellingLines =
      mobalyticsComp?.guide.overview.find((section) => /levell?ing guide/i.test(section.title))?.lines ?? [];

    expect(mobalyticsComp).toBeDefined();
    expect(levellingLines.some((line) => /\bwith\s+\d+\+?\s+gold\b/i.test(line))).toBe(true);
  });

  it("canonicalizes duplicate Meepsie champion records", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const meepsies = Object.values(dataset.championsById).filter((champion) => champion.name === "Meepsie");

    expect(meepsies.map((champion) => champion.id)).toEqual(["meepsie"]);
  });

  it("does not ship missing item placeholder icons", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const missingItems = Object.entries(dataset.itemsById)
      .filter(([, item]) => item.icon.endsWith("/missingno.png") || item.icon === "assets/items/missingno.png")
      .map(([itemId]) => itemId);

    expect(missingItems).toEqual([]);
  });

  it("generates team planner copy codes for every shipped provider build", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const missingCodes = dataset.comps.filter((comp) => !comp.teamCode);
    const nonMobalyticsWithCode = dataset.comps.filter((comp) => comp.sources[0]?.name !== "mobalytics" && comp.teamCode);

    expect(missingCodes.map((comp) => comp.title)).toEqual([]);
    expect(nonMobalyticsWithCode.length).toBeGreaterThan(0);
    expect(dataset.comps.every((comp) => /^02(?:[0-9a-f]{3}){10}TFTSet17$/i.test(comp.teamCode ?? ""))).toBe(true);
  });

  it("keeps duplicate board units in generated team planner copy codes", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const comp = dataset.comps.find((candidate) => candidate.title === "Two Tanky Urgot (TFT Academy)");

    expect(comp).toBeDefined();
    expect(comp?.teamCode).toMatch(/^02(?:[0-9a-f]{3}){10}TFTSet17$/i);
    if (!comp?.teamCode) {
      return;
    }

    const encodedChampionChunks = comp.teamCode.slice(2, -"TFTSet17".length).match(/.{3}/g) ?? [];
    const filledSlots = comp.phases.late.boardSlots.filter((slot) => slot.championId);

    expect(encodedChampionChunks.filter((chunk) => chunk !== "000")).toHaveLength(filledSlots.length);
  });

  it("preserves TFT Academy duplicate units, slot stars, and main augment picks", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const comp = dataset.comps.find((candidate) => candidate.title === "Two Tanky Urgot (TFT Academy)");

    expect(comp).toBeDefined();
    if (!comp) {
      return;
    }

    const filledSlots = comp.phases.late.boardSlots.filter((slot) => slot.championId);
    const maokaiSlots = filledSlots.filter((slot) => slot.championId === "maokai");
    const urgotSlots = filledSlots.filter((slot) => slot.championId === "urgot");

    expect(comp.recommendedAugmentIds).toContain("two-tanky");
    expect(maokaiSlots).toHaveLength(2);
    expect(urgotSlots).toHaveLength(2);
    expect(maokaiSlots.some((slot) => slot.starLevel === 3)).toBe(true);
    expect(urgotSlots.some((slot) => slot.starLevel === 3)).toBe(true);
  });

  it("captures TFTactics augment-required comps as recommended augments", () => {
    const dataset = datasetSchema.parse(generatedDataset);
    const tacticsAugmentComp = dataset.comps.find(
      (comp) => comp.sources[0]?.name === "tftactics" && comp.title === "Two Tanky (TFTactics)"
    );

    expect(tacticsAugmentComp).toBeDefined();
    expect(tacticsAugmentComp?.recommendedAugmentIds).toContain("two-tanky");
  });
});

describe("TFTFlow detail parsing", () => {
  it("extracts rank, playstyle, guide text, augments, board items, and demand inputs", () => {
    const comp = parseTftflowDetailHtml(
      `
        <main>
          <h1 class="comp-title">Space Groove Nami</h1>
          <div class="builder-comp-options-container">
            <button class="tier-icon-button"><span class="tier-dropdown-label">B</span></button>
          </div>
          <div class="comp-econ-strategy-label">Fast 8</div>
          <div class="comp-augment-priority">Emblem + Econ + Combat</div>
          <ul>
            <li class="tips-li-content">Play strongest board and hold Nami pairs.</li>
          </ul>
          <div class="condition-tier-group">
            <div class="condition-tier-group-title">Strong conditions</div>
            <div class="condition-item">
              <img data-augment-apiname="TFT_Augment_Misfits" alt="Misfits" />
              <span class="modal-item-name">Misfits</span>
            </div>
            <div class="condition-card">Space Groove Emblem: B -> S</div>
            <div class="condition-card">Prismatic Ticket: B -> A</div>
          </div>
          <ol class="econ-ol">
            <li class="econ-li-content">Level 4 at 2-1</li>
            <li class="econ-li-content">Level 8 at 4-2 - roll for core board</li>
          </ol>
          <svg class="boards-flex-container">
            <g class="board-unit">
              <image href="/champions/TFT17_Nami.TFT_Set17.png"></image>
              <image href="/items/TFT_Item_SpearOfShojin.TFT_Set17.png"></image>
              <image href="/items/TFT17_Emblem_SpaceGroove.TFT_Set17.png"></image>
            </g>
            <g class="board-unit">
              <image href="/champions/TFT17_Zac.TFT_Set17.png"></image>
              <image href="/items/TFT_Item_WarmogsArmor.TFT_Set17.png"></image>
            </g>
          </svg>
        </main>
      `,
      "https://tftflow.com/composition/set17/space-groove-nami",
      0,
      {
        itemIdByApiName: {
          TFT_Item_SpearOfShojin: "spear-of-shojin",
          TFT_Item_WarmogsArmor: "warmogs-armor",
          TFT17_Emblem_SpaceGroove: "space-groove-emblem"
        }
      }
    );

    expect(comp.tier).toBe("B");
    expect(comp.playstyle).toBe("Fast 8");
    expect(comp.augmentTypes).toContain("Emblem");
    expect(comp.augments?.some((augment) => augment.apiName === "TFT_Augment_Misfits")).toBe(true);
    expect(comp.augments?.some((augment) => augment.name === "Prismatic Ticket")).toBe(true);
    expect(comp.tips?.some((tip) => tip.tip.includes("Play strongest board"))).toBe(true);
    expect(comp.tips?.some((tip) => tip.tip.includes("Space Groove Emblem"))).toBe(true);
    expect(comp.tips?.some((tip) => tip.tip.includes("Level 8 at 4-2"))).toBe(true);
    expect(comp.finalUnits?.some((unit) => unit.itemIds.includes("space-groove-emblem"))).toBe(true);
    expect(comp.finalUnits?.some((unit) => unit.itemIds.includes("warmogs-armor"))).toBe(true);
  });
});
