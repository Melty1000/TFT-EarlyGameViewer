import type { Comp } from "../../shared/tft";

export function getSourceDisplayName(source: string) {
  const normalized = source.toLowerCase();

  if (normalized.includes("mobalytics")) {
    return "Mobalytics";
  }

  if (normalized.includes("academy")) {
    return "TFT Academy";
  }

  if (normalized.includes("tactics")) {
    return "TFTactics";
  }

  if (normalized.includes("flow")) {
    return "TFTFlow";
  }

  if (normalized.includes("meta")) {
    return "MetaTFT";
  }

  return source;
}

export function getSourceAbbreviation(source: string) {
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

export function getPlaystyleIcon(playstyle: string | null) {
  const normalized = playstyle?.toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  if (normalized.includes("reroll") || normalized.includes("slow")) {
    return `${import.meta.env.BASE_URL}assets/system/reroll_default.png`;
  }

  if (normalized.includes("fast") || normalized.includes("level")) {
    return `${import.meta.env.BASE_URL}assets/system/boost_default.png`;
  }

  return null;
}

export function getPlaystyleLabel(playstyle: string | null) {
  const raw = playstyle?.trim();
  if (!raw) {
    return null;
  }

  const label = raw
    .replace(/[-_]+/g, " ")
    .replace(/\bfast\s*(\d+)\b/gi, "level $1")
    .replace(/\b(?:level|lvl)\s*(\d+)\b/gi, "level $1")
    .replace(/\b(\d+)\s*(?:slow\s*roll|reroll|re\s*roll)\b/gi, "level $1")
    .replace(/\b(?:slow\s*roll|reroll|re\s*roll|roll)\s*\(?\s*(\d+)\s*\)?/gi, "level $1")
    .replace(/\((\d+)\)/g, "level $1")
    .replace(/\b(?:re\s*roll|reroll|slow\s*roll|roll|fast)\b/gi, "")
    .replace(/\blevel\s+(\d+)/gi, "L$1")
    .replace(/\blvl\s+(\d+)/gi, "L$1")
    .replace(/\b(\d+)\s+cost\b/gi, "$1-cost")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^\d+$/.test(label)) {
    return `Level ${label}`;
  }

  const displayLabel = label.replace(/\bL(\d+)\b/g, "level $1") || raw;
  return displayLabel.replace(/\blevel\b/gi, "Level").replace(/^[a-z]/, (letter) => letter.toUpperCase());
}

export function getRankIcon(tier: string | null | undefined) {
  const normalized = tier?.trim().toLowerCase();
  const iconTier = normalized && ["x", "s", "a", "b", "c", "d"].includes(normalized) ? normalized : "unknown";

  return `${import.meta.env.BASE_URL}assets/ranks/${iconTier}.svg`;
}

export function getCompDisplayTitle(comp: Comp) {
  const sourceName = comp.sources[0]?.name;
  if (!sourceName) {
    return comp.title;
  }

  const sourceDisplayName = getSourceDisplayName(sourceName);
  return comp.title.replace(new RegExp(`\\s\\(${sourceDisplayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");
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
