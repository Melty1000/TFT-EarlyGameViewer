import { COMPONENT_LABELS, COMPONENT_RECIPES, titleCaseFromSlug } from "../../shared/normalization";
import type { Dataset } from "../../shared/tft";

export type ItemDisplay = {
  id: string;
  name: string;
  description: string;
  icon: string;
  recipe: ItemDisplay[];
};

function getRecipeKeyCandidates(itemId: string) {
  const possessiveNormalized = itemId.replace(/-s-/g, "s-").replace(/-s$/g, "s");
  return [itemId, possessiveNormalized, itemId.replace(/-/g, "")];
}

function getEmblemSynergy(dataset: Dataset, itemId: string) {
  if (!itemId.endsWith("-emblem")) {
    return null;
  }

  const traitId = itemId.replace(/-emblem$/, "");
  return (
    dataset.synergiesById[traitId] ??
    Object.values(dataset.synergiesById).find((synergy) => synergy.id.replace(/-/g, "") === traitId.replace(/-/g, "")) ??
    null
  );
}

export function getItemRecipeIds(itemId: string): [string, string] | null {
  for (const candidate of getRecipeKeyCandidates(itemId)) {
    const recipe = COMPONENT_RECIPES[candidate];
    if (recipe) {
      return recipe;
    }
  }

  return null;
}

export function getItemDisplay(dataset: Dataset, itemId: string): ItemDisplay {
  const item = dataset.itemsById?.[itemId];
  const emblemSynergy = item ? null : getEmblemSynergy(dataset, itemId);
  const recipeIds = (getItemRecipeIds(itemId) ?? []).slice(0, 2);

  return {
    id: itemId,
    name: item?.name ?? (emblemSynergy ? `${emblemSynergy.name} Emblem` : COMPONENT_LABELS[itemId] ?? titleCaseFromSlug(itemId)),
    description: item?.description ?? (emblemSynergy ? `Counts as ${emblemSynergy.name}.` : ""),
    icon: item?.icon ?? emblemSynergy?.icon ?? `${import.meta.env.BASE_URL}assets/items/${itemId}.png`,
    recipe: recipeIds.map((componentId) => ({
      id: componentId,
      name: COMPONENT_LABELS[componentId] ?? dataset.itemsById?.[componentId]?.name ?? titleCaseFromSlug(componentId),
      description: dataset.itemsById?.[componentId]?.description ?? "",
      icon: dataset.itemsById?.[componentId]?.icon ?? `${import.meta.env.BASE_URL}assets/items/${componentId}.png`,
      recipe: []
    }))
  };
}
