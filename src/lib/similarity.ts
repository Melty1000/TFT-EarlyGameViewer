import type { Comp, Dataset } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";

export type SimilaritySelection = {
  championIds: string[];
  augmentIds: string[];
  itemIds: string[];
  componentIds: string[];
};

export type SimilarityMatchBucket = {
  selected: string[];
  matched: string[];
  missing: string[];
  score: number;
  possibleScore: number;
};

export type SimilarityResult = {
  comp: Comp;
  score: number;
  possibleScore: number;
  matchPercent: number;
  breakdown: {
    champions: SimilarityMatchBucket;
    augments: SimilarityMatchBucket;
    items: SimilarityMatchBucket;
    components: SimilarityMatchBucket;
  };
};

export type SimilarityPhaseFocus = PhaseKey | PhaseKey[];

const SIMILARITY_WEIGHTS = {
  champions: 5,
  augments: 4,
  items: 4,
  components: 2
} as const;

const PHASE_KEYS: PhaseKey[] = ["early", "mid", "late"];

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function bucketScore(selectedIds: string[], availableIds: Iterable<string>, weight: number): SimilarityMatchBucket {
  const selected = unique(selectedIds);
  const available = new Set(availableIds);
  const matched = selected.filter((id) => available.has(id));
  const missing = selected.filter((id) => !available.has(id));

  return {
    selected,
    matched,
    missing,
    score: matched.length * weight,
    possibleScore: selected.length * weight
  };
}

function countedBucketScore(
  selectedIds: string[],
  availableCounts: Record<string, number>,
  weight: number
): SimilarityMatchBucket {
  const usedCounts: Record<string, number> = {};
  const selected = selectedIds.filter(Boolean);
  const matched: string[] = [];
  const missing: string[] = [];

  for (const id of selected) {
    const used = usedCounts[id] ?? 0;
    const available = availableCounts[id] ?? 0;

    if (used < available) {
      matched.push(id);
      usedCounts[id] = used + 1;
    } else {
      missing.push(id);
    }
  }

  return {
    selected,
    matched,
    missing,
    score: matched.length * weight,
    possibleScore: selected.length * weight
  };
}

function normalizePhaseFocus(phaseFocus: SimilarityPhaseFocus): PhaseKey[] {
  const phases: PhaseKey[] = Array.isArray(phaseFocus) ? phaseFocus : [phaseFocus];
  const normalized = unique(phases);
  return normalized.length ? normalized : ["early"];
}

function getBoardChampionIds(comp: Comp, phaseFocus: SimilarityPhaseFocus) {
  return normalizePhaseFocus(phaseFocus).flatMap((phase) =>
    comp.phases[phase].boardSlots
      .map((slot) => slot.championId)
      .filter((championId): championId is string => Boolean(championId))
  );
}

function getAllBoardItemIds(comp: Comp) {
  return PHASE_KEYS.flatMap((phase) => comp.phases[phase].boardSlots.flatMap((slot) => slot.itemIds ?? []));
}

function getComponentDemandCounts(comp: Comp) {
  return comp.componentDemand.reduce<Record<string, number>>((counts, component) => {
    counts[component.componentId] = (counts[component.componentId] ?? 0) + component.count;
    return counts;
  }, {});
}

export function scoreCompSimilarity(
  comp: Comp,
  _dataset: Dataset,
  selection: SimilaritySelection,
  phase: SimilarityPhaseFocus
): SimilarityResult {
  const breakdown = {
    champions: bucketScore(selection.championIds, getBoardChampionIds(comp, phase), SIMILARITY_WEIGHTS.champions),
    augments: bucketScore(selection.augmentIds, comp.recommendedAugmentIds, SIMILARITY_WEIGHTS.augments),
    items: bucketScore(selection.itemIds, getAllBoardItemIds(comp), SIMILARITY_WEIGHTS.items),
    components: countedBucketScore(
      selection.componentIds,
      getComponentDemandCounts(comp),
      SIMILARITY_WEIGHTS.components
    )
  };
  const score = Object.values(breakdown).reduce((total, bucket) => total + bucket.score, 0);
  const possibleScore = Object.values(breakdown).reduce((total, bucket) => total + bucket.possibleScore, 0);

  return {
    comp,
    score,
    possibleScore,
    matchPercent: possibleScore > 0 ? score / possibleScore : 0,
    breakdown
  };
}

export function rankCompsBySimilarity(
  comps: Comp[],
  dataset: Dataset,
  selection: SimilaritySelection,
  phase: SimilarityPhaseFocus
): SimilarityResult[] {
  return comps
    .map((comp) => scoreCompSimilarity(comp, dataset, selection, phase))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.matchPercent !== left.matchPercent) {
        return right.matchPercent - left.matchPercent;
      }

      return left.comp.title.localeCompare(right.comp.title);
    });
}
