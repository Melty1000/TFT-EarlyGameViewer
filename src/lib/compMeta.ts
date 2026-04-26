import type { Comp } from "../../shared/tft";

function getSourceAbbreviation(source: string) {
  const normalized = source.toLowerCase();

  if (normalized.includes("mobalytics")) {
    return "MOB";
  }

  if (normalized.includes("academy")) {
    return "ACD";
  }

  if (normalized.includes("tactics")) {
    return "TAC";
  }

  if (normalized.includes("flow")) {
    return "FLW";
  }

  if (normalized.includes("meta")) {
    return "MTF";
  }

  return source
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function getCompPlaystyle(comp: Comp): string | null {
  return (
    comp.guide.overview
      .find((section) => section.title === "How to play")
      ?.lines.find((line) => line.startsWith("Style: "))
      ?.replace(/^Style:\s*/i, "")
      .trim() || null
  );
}

export function getCompRankTags(comp: Comp) {
  return comp.sources
    .filter((source) => source.tier?.trim())
    .map((source) => ({
      key: `${source.name}-${source.tier}`,
      label: `${source.name} ${source.tier}`,
      sourceShort: getSourceAbbreviation(source.name),
      shortLabel: `${getSourceAbbreviation(source.name)} ${source.tier?.trim().toUpperCase()}`,
      source: source.name,
      tier: source.tier?.trim().toUpperCase() ?? ""
    }));
}
