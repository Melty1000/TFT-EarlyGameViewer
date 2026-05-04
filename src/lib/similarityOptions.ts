import { COMPONENT_LABELS, normalizeChampionLookup, normalizeId } from "../../shared/normalization";
import type { Dataset } from "../../shared/tft";

export type SimilarityEntityKind = "champion" | "augment" | "item" | "component";

export type SimilarityEntityOption = {
  kind: SimilarityEntityKind;
  id: string;
  name: string;
  icon: string;
  meta?: string;
};

export type SimilarityEntitySection = {
  title: string;
  kind: SimilarityEntityKind;
  options: SimilarityEntityOption[];
};

const AUGMENT_TIER_ORDER: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  Unknown: 5
};

function getPreferredChampionOption(
  current: SimilarityEntityOption | undefined,
  next: SimilarityEntityOption
): SimilarityEntityOption {
  if (!current) {
    return next;
  }

  if (next.id === normalizeId(next.name)) {
    return next;
  }

  return current;
}

function getChampionOptions(dataset: Dataset): SimilarityEntityOption[] {
  const optionsByName = new Map<string, SimilarityEntityOption>();

  for (const champion of Object.values(dataset.championsById)) {
    if (champion.cost > 5) {
      continue;
    }

    const option = {
      kind: "champion" as const,
      id: normalizeChampionLookup(champion.id),
      name: champion.name,
      icon: champion.icon,
      meta: `${champion.cost}C`
    };
    const key = normalizeId(champion.name);

    optionsByName.set(key, getPreferredChampionOption(optionsByName.get(key), option));
  }

  return [...optionsByName.values()].sort((left, right) => {
    const leftCost = Number.parseInt(left.meta ?? "0", 10);
    const rightCost = Number.parseInt(right.meta ?? "0", 10);
    return leftCost - rightCost || left.name.localeCompare(right.name);
  });
}

export function getSimilarityEntitySections(dataset: Dataset): SimilarityEntitySection[] {
  const champions = getChampionOptions(dataset);
  const augments = Object.values(dataset.augmentsById)
    .sort((left, right) => {
      const leftTier = AUGMENT_TIER_ORDER[left.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      const rightTier = AUGMENT_TIER_ORDER[right.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      return leftTier - rightTier || left.name.localeCompare(right.name);
    })
    .map((augment) => ({
      kind: "augment" as const,
      id: augment.id,
      name: augment.name,
      icon: augment.icon,
      meta: augment.tier === "Unknown" ? undefined : augment.tier
    }));
  const items = Object.values(dataset.itemsById)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      kind: "item" as const,
      id: item.id,
      name: item.name,
      icon: item.icon
    }));
  const components = Object.entries(COMPONENT_LABELS).map(([componentId, label]) => ({
    kind: "component" as const,
    id: componentId,
    name: label,
    icon: `${import.meta.env.BASE_URL}assets/items/${componentId}.png`
  }));

  return [
    { title: "Champions", kind: "champion", options: champions },
    { title: "Augments", kind: "augment", options: augments },
    { title: "Items", kind: "item", options: items },
    { title: "Components", kind: "component", options: components }
  ];
}
