import type { Comp } from "../../shared/tft";

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
      source: source.name,
      tier: source.tier?.trim().toUpperCase() ?? ""
    }));
}
