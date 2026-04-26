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
  const recipeIds = getItemRecipeIds(itemId) ?? [];

  return {
    id: itemId,
    name: item?.name ?? COMPONENT_LABELS[itemId] ?? titleCaseFromSlug(itemId),
    description: item?.description ?? "",
    icon: item?.icon ?? `${import.meta.env.BASE_URL}assets/items/${itemId}.png`,
    recipe: recipeIds.map((componentId) => ({
      id: componentId,
      name: COMPONENT_LABELS[componentId] ?? dataset.itemsById?.[componentId]?.name ?? titleCaseFromSlug(componentId),
      description: dataset.itemsById?.[componentId]?.description ?? "",
      icon: dataset.itemsById?.[componentId]?.icon ?? `${import.meta.env.BASE_URL}assets/items/${componentId}.png`,
      recipe: []
    }))
  };
}
