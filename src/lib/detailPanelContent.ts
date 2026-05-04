import type { PhaseKey } from "../../shared/normalization";
import type { Champion, Comp, Dataset, GuideSection } from "../../shared/tft";
import { getItemDisplay, type ItemDisplay } from "./items";

export type DetailPanelGuideGroups = {
  overview: GuideSection[];
  gamePlan: GuideSection[];
};

export type AssignedItemHolder = {
  champion: Champion;
  slotIndex: number;
  starLevel: number;
  items: {
    item: ItemDisplay;
    recipe: ItemDisplay[];
    index: number;
  }[];
};

function normalizeGuideTitle(title: string) {
  return title.trim().toLowerCase();
}

function isLevellingGuideTitle(title: string) {
  const normalizedTitle = normalizeGuideTitle(title);
  return (
    normalizedTitle === "levelling guide" ||
    normalizedTitle === "leveling guide" ||
    normalizedTitle.includes("level")
  );
}

function getPrimarySourceName(comp: Comp) {
  return comp.sources[0]?.name.trim().toLowerCase() ?? "";
}

function cleanGamePlanLine(line: string) {
  return line
    .replace(/^TFTFlow tips:\s*/i, "")
    .replace(/^(.+?)\s+augment angle$/i, "Angle: $1")
    .replace(/^Preferred augment angle:/i, "Preferred angles:")
    .replace(/^Comfortable line:/i, "Line:")
    .trim();
}

function normalizeGamePlanSection(section: GuideSection): GuideSection | null {
  const lines = section.lines
    .filter((line) => !/^Style:\s*/i.test(line))
    .map(cleanGamePlanLine)
    .filter(Boolean);

  return lines.length ? { title: section.title, lines } : null;
}

function normalizeOverviewSection(section: GuideSection): GuideSection | null {
  const lines = section.lines.filter((line) => !/^Source:\s*/i.test(line));
  return lines.length ? { title: section.title, lines } : null;
}

export function getDetailPanelGuideGroups(comp: Comp, phase: PhaseKey): DetailPanelGuideGroups {
  const overview: GuideSection[] = [];
  const gamePlan: GuideSection[] = [];

  for (const section of comp.guide.overview) {
    const title = normalizeGuideTitle(section.title);

    if (isLevellingGuideTitle(section.title)) {
      continue;
    }

    if (title === "general info") {
      const overviewSection = normalizeOverviewSection(section);
      if (overviewSection) {
        overview.push(overviewSection);
      }
      continue;
    }

    const gamePlanSection = normalizeGamePlanSection(section);
    if (gamePlanSection) {
      gamePlan.push(gamePlanSection);
    }
  }

  for (const section of comp.guide.phases[phase]) {
    if (isLevellingGuideTitle(section.title)) {
      continue;
    }

    const gamePlanSection = normalizeGamePlanSection(section);
    if (gamePlanSection) {
      gamePlan.push(gamePlanSection);
    }
  }

  return { overview, gamePlan };
}

export function getLevellingGuideSection(comp: Comp, phase: PhaseKey): GuideSection | null {
  const overviewSections = comp.guide.overview;
  const phaseSections = comp.guide.phases[phase];
  const sourceName = getPrimarySourceName(comp);
  const exactTitles = sourceName === "tftflow" ? overviewSections : [...overviewSections, ...phaseSections];

  return (
    exactTitles.find((section) => ["levelling guide", "leveling guide"].includes(normalizeGuideTitle(section.title))) ??
    phaseSections.find((section) => ["levelling guide", "leveling guide"].includes(normalizeGuideTitle(section.title))) ??
    phaseSections.find((section) => isLevellingGuideTitle(section.title)) ??
    overviewSections.find((section) => isLevellingGuideTitle(section.title)) ??
    null
  );
}

export function getAssignedItemHolders(comp: Comp, dataset: Dataset, phase: PhaseKey): AssignedItemHolder[] {
  const phaseData = comp.phases[phase];

  return phaseData.boardSlots.flatMap((slot): AssignedItemHolder[] => {
    if (!slot.championId || !slot.itemIds.length) {
      return [];
    }

    const champion = dataset.championsById[slot.championId];
    if (!champion) {
      return [];
    }

    const items = slot.itemIds.map((itemId, index) => {
      const item = getItemDisplay(dataset, itemId);

      return {
        item,
        recipe: item.recipe.slice().sort((left, right) => left.name.localeCompare(right.name)),
        index
      };
    });

    return [
      {
        champion,
        slotIndex: slot.index,
        starLevel: slot.starLevel ?? phaseData.championLevels?.[champion.id] ?? 1,
        items
      }
    ];
  });
}
