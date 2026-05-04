import type { Comp, Dataset } from "../../shared/tft";
import { getNativeBoardPhases, hasNativeBoardPhase } from "../../shared/phaseAvailability";

export type PhaseFilter = "all" | "early" | "mid" | "late";

function getSearchHaystack(comp: Comp, dataset: Dataset, phase: PhaseFilter): string[] {
  const phaseKeys = phase === "all" ? getNativeBoardPhases(comp) : hasNativeBoardPhase(comp, phase) ? [phase] : [];
  const tokens = [comp.title];

  for (const phaseKey of phaseKeys) {
    const current = comp.phases[phaseKey];
    for (const championId of current.championIds) {
      tokens.push(dataset.championsById[championId]?.name ?? championId);
    }
    for (const synergyId of current.synergyIds) {
      tokens.push(dataset.synergiesById[synergyId]?.name ?? synergyId);
    }
  }

  for (const augmentId of comp.recommendedAugmentIds) {
    tokens.push(dataset.augmentsById[augmentId]?.name ?? augmentId);
  }

  return tokens.map((token) => token.toLowerCase());
}

export function tokenizeSearch(raw: string): string[] {
  return raw
    .split(",")
    .flatMap((part) => part.split(/\s+/))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

export function compMatchesFilters(
  comp: Comp,
  dataset: Dataset,
  phase: PhaseFilter,
  chips: string[],
  liveQuery: string
): boolean {
  if (phase !== "all" && !hasNativeBoardPhase(comp, phase)) {
    return false;
  }

  const searchTokens = [...chips, ...tokenizeSearch(liveQuery)];
  if (searchTokens.length === 0) {
    return true;
  }

  const haystack = getSearchHaystack(comp, dataset, phase).join(" ");
  return searchTokens.every((token) => haystack.includes(token));
}

export function getCompHeadline(comp: Comp, dataset: Dataset): string[] {
  return comp.phases.late.championIds
    .slice(0, 4)
    .map((id) => dataset.championsById[id]?.name ?? id);
}
