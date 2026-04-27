import { describe, expect, it } from "vitest";
import type { BoardSlot, Comp, Dataset, PhaseData } from "../shared/tft";
import { rankCompsBySimilarity, scoreCompSimilarity, type SimilaritySelection } from "../src/lib/similarity";

function emptyBoardSlot(index: number): BoardSlot {
  return {
    index,
    championId: null,
    locked: false,
    itemIds: [],
    starLevel: 1
  };
}

function phase(championIds: string[], itemIdsByChampion: Record<string, string[]> = {}): PhaseData {
  const boardSlots = Array.from({ length: 28 }, (_, index) => emptyBoardSlot(index));

  championIds.forEach((championId, index) => {
    boardSlots[index] = {
      ...boardSlots[index],
      championId,
      itemIds: itemIdsByChampion[championId] ?? []
    };
  });

  return {
    boardSlots,
    championIds,
    synergyIds: [],
    championLevels: {}
  };
}

function comp(
  id: string,
  phases: Comp["phases"],
  recommendedAugmentIds: string[] = [],
  componentIds: string[] = []
): Comp {
  return {
    id,
    title: id,
    sourceUrl: `https://example.com/${id}`,
    sources: [{ name: "fixture", url: `https://example.com/${id}`, tier: "A", confidence: 1 }],
    phases,
    recommendedAugmentIds,
    guide: {
      overview: [],
      phases: {
        early: [],
        mid: [],
        late: []
      }
    },
    componentDemand: componentIds.map((componentId) => ({ componentId, label: componentId, count: 1 }))
  };
}

const dataset = {
  meta: {
    schemaVersion: "1",
    set: 17,
    generatedAt: "2026-04-26T00:00:00.000Z",
    source: {
      comps: "fixture",
      champions: "fixture",
      augmentRanks: "fixture"
    }
  },
  comps: [],
  championsById: {},
  augmentsById: {},
  synergiesById: {},
  itemsById: {}
} satisfies Dataset;

describe("similarity scoring", () => {
  it("scores selected champions only against the selected phase board", () => {
    const earlyMatch = comp("early-match", {
      early: phase(["ahri"]),
      mid: phase([]),
      late: phase([])
    });
    const lateOnlyMatch = comp("late-only-match", {
      early: phase([]),
      mid: phase([]),
      late: phase(["ahri"])
    });
    const selection: SimilaritySelection = {
      championIds: ["ahri"],
      augmentIds: [],
      itemIds: [],
      componentIds: []
    };

    const earlyScores = rankCompsBySimilarity([lateOnlyMatch, earlyMatch], dataset, selection, "early");

    expect(earlyScores[0].comp.id).toBe("early-match");
    expect(earlyScores[0].breakdown.champions.matched).toEqual(["ahri"]);
    expect(earlyScores[1].breakdown.champions.matched).toEqual([]);

    const lateScores = rankCompsBySimilarity([earlyMatch, lateOnlyMatch], dataset, selection, "late");

    expect(lateScores[0].comp.id).toBe("late-only-match");
    expect(lateScores[0].breakdown.champions.matched).toEqual(["ahri"]);
  });

  it("scores selected champions against the union of multiple selected phase boards without double-counting", () => {
    const multiPhaseMatch = comp("multi-phase-match", {
      early: phase(["ahri"]),
      mid: phase(["ahri", "zed"]),
      late: phase([])
    });
    const lateOnlyMatch = comp("late-only-match", {
      early: phase([]),
      mid: phase([]),
      late: phase(["zed"])
    });
    const selection: SimilaritySelection = {
      championIds: ["ahri", "zed"],
      augmentIds: [],
      itemIds: [],
      componentIds: []
    };

    const [topResult, bottomResult] = rankCompsBySimilarity(
      [lateOnlyMatch, multiPhaseMatch],
      dataset,
      selection,
      ["early", "mid"]
    );

    expect(topResult.comp.id).toBe("multi-phase-match");
    expect(topResult.breakdown.champions.matched).toEqual(["ahri", "zed"]);
    expect(topResult.breakdown.champions.score).toBe(10);
    expect(bottomResult.breakdown.champions.matched).toEqual([]);
  });

  it("scores completed items against every phase board, regardless of selected phase", () => {
    const itemMatch = comp("item-match", {
      early: phase([]),
      mid: phase([]),
      late: phase(["urgot"], { urgot: ["guinsoos-rageblade"] })
    });
    const selection: SimilaritySelection = {
      championIds: [],
      augmentIds: [],
      itemIds: ["guinsoos-rageblade"],
      componentIds: []
    };

    const result = scoreCompSimilarity(itemMatch, dataset, selection, "early");

    expect(result.breakdown.items.matched).toEqual(["guinsoos-rageblade"]);
    expect(result.score).toBeGreaterThan(0);
  });

  it("scores augments and components globally instead of by phase", () => {
    const fullMatch = comp(
      "global-match",
      {
        early: phase([]),
        mid: phase([]),
        late: phase([])
      },
      ["birthday-present"],
      ["bow"]
    );
    const noMatch = comp("no-match", {
      early: phase([]),
      mid: phase([]),
      late: phase([])
    });
    const selection: SimilaritySelection = {
      championIds: [],
      augmentIds: ["birthday-present"],
      itemIds: [],
      componentIds: ["bow"]
    };

    const [topResult, bottomResult] = rankCompsBySimilarity([noMatch, fullMatch], dataset, selection, "mid");

    expect(topResult.comp.id).toBe("global-match");
    expect(topResult.breakdown.augments.matched).toEqual(["birthday-present"]);
    expect(topResult.breakdown.components.matched).toEqual(["bow"]);
    expect(bottomResult.score).toBe(0);
  });

  it("scores duplicate selected components against component demand counts", () => {
    const oneBow = comp(
      "one-bow",
      {
        early: phase([]),
        mid: phase([]),
        late: phase([])
      },
      [],
      ["bow"]
    );
    const twoBows = {
      ...oneBow,
      id: "two-bows",
      title: "two-bows",
      componentDemand: [{ componentId: "bow", label: "bow", count: 2 }]
    };
    const selection: SimilaritySelection = {
      championIds: [],
      augmentIds: [],
      itemIds: [],
      componentIds: ["bow", "bow"]
    };

    const [topResult, bottomResult] = rankCompsBySimilarity([oneBow, twoBows], dataset, selection, "early");

    expect(topResult.comp.id).toBe("two-bows");
    expect(topResult.breakdown.components.matched).toEqual(["bow", "bow"]);
    expect(bottomResult.breakdown.components.matched).toEqual(["bow"]);
    expect(bottomResult.breakdown.components.missing).toEqual(["bow"]);
  });
});
