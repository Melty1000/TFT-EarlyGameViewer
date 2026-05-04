import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  AUGMENT_RANKS,
  COMPONENT_LABELS,
  COMPONENT_RECIPES,
  PHASES,
  normalizeAugmentLookup,
  normalizeChampionLookup,
  normalizeId,
  normalizeTierRank,
  titleCaseFromSlug,
  type PhaseKey
} from "../shared/normalization";
import { phaseHasBoardData } from "../shared/phaseAvailability";
import {
  datasetSchema,
  type BoardSlot,
  type Comp,
  type CompGuide,
  type Dataset,
  type GuideSection,
  type PhaseData,
  type ProviderEvidence,
  type ProviderProvenance
} from "../shared/tft";

type SourceName = "tftacademy" | "mobalytics" | "tftactics" | "tftflow" | "metatft";

type SourceUnit = {
  championId: string;
  boardIndex?: number;
  itemIds: string[];
  starLevel?: number;
};

type SourceAugment = {
  apiName?: string;
  name?: string;
  slug?: string;
};

type SourceComp = {
  source: SourceName;
  externalId: string;
  title: string;
  url: string;
  tier?: string;
  playstyle?: string;
  units: SourceUnit[];
  earlyUnits?: SourceUnit[];
  midUnits?: SourceUnit[];
  finalUnits?: SourceUnit[];
  augments?: SourceAugment[];
  augmentTypes?: string[];
  tips?: Array<{ stage: string; tip: string }>;
  augmentsTip?: string;
  levelingLines?: string[];
  mainChampionId?: string;
  mainItemId?: string;
  teamCode?: string;
  createdAt?: string;
  updatedAt?: string;
};

function sourceDisplayName(source: SourceName) {
  switch (source) {
    case "mobalytics":
      return "Mobalytics";
    case "tftacademy":
      return "TFT Academy";
    case "tftactics":
      return "TFTactics";
    case "tftflow":
      return "TFTFlow";
    case "metatft":
      return "MetaTFT";
  }
}

function sourceTierOrder(tier?: string) {
  const normalized = tier?.trim().toUpperCase() ?? "";
  if (normalized.startsWith("X")) {
    return 0;
  }
  if (normalized.startsWith("S") || normalized === "OP") {
    return 1;
  }
  if (normalized.startsWith("A")) {
    return 2;
  }
  if (normalized.startsWith("B")) {
    return 3;
  }
  if (normalized.startsWith("C")) {
    return 4;
  }
  if (normalized.startsWith("D")) {
    return 5;
  }
  return 6;
}

function sourceOrder(source: SourceName) {
  const index = (["mobalytics", "tftacademy", "tftactics", "tftflow", "metatft"] as SourceName[]).indexOf(source);
  return index === -1 ? 99 : index;
}

function normalizeCompTier(value: string | null | undefined) {
  const match = cleanText(value).match(/\b(X|S|A|B|C|D)\b/i);
  return match ? match[1].toUpperCase() : "";
}

type CDragonChampion = {
  apiName?: string;
  name?: string;
  cost?: number;
  traits?: string[];
  ability?: {
    name?: string;
    desc?: string;
  };
  stats?: Record<string, number>;
  squareIcon?: string;
  tileIcon?: string;
  icon?: string;
  role?: string;
};

type CDragonTraitEffect = {
  minUnits?: number;
  maxUnits?: number;
  style?: number;
  variables?: Record<string, number | string | null>;
};

type CDragonTrait = {
  apiName?: string;
  name?: string;
  desc?: string;
  icon?: string;
  effects?: CDragonTraitEffect[];
};

type CDragonItem = {
  apiName?: string;
  name?: string;
  desc?: string;
  icon?: string;
  composition?: string[];
};

type CDragonTftData = {
  items?: CDragonItem[];
  setData?: Array<{
    number?: number;
    mutator?: string;
    items?: string[];
    augments?: string[];
  }>;
  sets?: Record<
    string,
    {
      champions?: CDragonChampion[];
      traits?: CDragonTrait[];
    }
  >;
};

type TeamPlannerChampion = {
  character_id?: string;
  display_name?: string;
  team_planner_code?: number;
};

type TeamPlannerData = Record<string, TeamPlannerChampion[]>;

type Catalogs = {
  championsById: Dataset["championsById"];
  synergiesById: Dataset["synergiesById"];
  augmentsById: Dataset["augmentsById"];
  itemsById: Dataset["itemsById"];
  championRoles: Record<string, string>;
  teamPlannerCodeByChampionId: Record<string, number>;
  synergyNameByApiName: Record<string, string>;
  itemIdByApiName: Record<string, string>;
  itemNameById: Record<string, string>;
  itemRecipeById: Record<string, [string, string]>;
  augmentIdByApiName: Record<string, string>;
  augmentIdByLookup: Record<string, string>;
  assetDownloads: AssetDownload[];
};

type AssetDownload = {
  url: string;
  webPath: string;
  filePath: string;
};

type MobalyticsLookups = {
  comps: SourceComp[];
  championsById: Record<
    string,
    {
      id: string;
      name: string;
      cost: number;
      traitIds: string[];
      abilityName: string;
      abilityDesc: string;
      requiresUnlock: boolean;
      unlockCondition: string | null;
      recommendedItemIds: string[];
      role?: string;
      stats: {
        hp: number | null;
        mana: number | null;
        initialMana: number | null;
        damage: number | null;
        range: number | null;
      };
      iconUrl: string | null;
    }
  >;
  augmentRankByApi: Record<string, string>;
  augmentRankBySlug: Record<string, string>;
  augmentNameByApi: Record<string, string>;
  augmentDescriptionByApi: Record<string, string>;
  championUnlocksById: Record<string, { requiresUnlock: boolean; unlockCondition: string | null }>;
};

const CURRENT_SET = 17;
const MOBALYTICS_MAX_RECOMMENDED_ITEMS_PER_CHAMPION = 8;
const DATASET_FILE = `tft-set${CURRENT_SET}.json`;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, "src", "data");
const RAW_DIR = path.join(ROOT_DIR, "data", "raw");
const CDRAGON_TFT_URL = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";
const CDRAGON_TEAM_PLANNER_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json";
const CDRAGON_GAME_BASE_URL = "https://raw.communitydragon.org/latest/game/";
const MOBALYTICS_COMPS_URL = `https://mobalytics.gg/tft/set${CURRENT_SET}/team-comps`;
const TFTACADEMY_COMPS_URL = "https://tftacademy.com/tierlist/comps";
const TFTACTICS_COMPS_URL = "https://tftactics.gg/tierlist/team-comps";
const TFTFLOW_COMPS_URL = "https://tftflow.com/";
const METATFT_CLUSTER_URL = "https://api-hc.metatft.com/tft-comps-api/latest_cluster_info";
const METATFT_BUILD_URL = "https://api-hc.metatft.com/tft-comps-api/comp_builds";
const METATFT_AUGMENT_URL = "https://api-hc.metatft.com/tft-comps-api/comp_augments";
const METATFT_OPTIONS_URL = "https://api-hc.metatft.com/tft-comps-api/comp_options";
const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
};

const COMPONENT_API_TO_ID: Record<string, string> = {
  TFT_Item_BFSword: "bf-sword",
  TFT_Item_RecurveBow: "recurve-bow",
  TFT_Item_NeedlesslyLargeRod: "needlessly-large-rod",
  TFT_Item_TearOfTheGoddess: "tear-of-the-goddess",
  TFT_Item_ChainVest: "chain-vest",
  TFT_Item_NegatronCloak: "negatron-cloak",
  TFT_Item_GiantsBelt: "giants-belt",
  TFT_Item_SparringGloves: "sparring-gloves",
  TFT_Item_Spatula: "spatula",
  TFT_Item_FryingPan: "frying-pan"
};

const MOBALYTICS_COMPONENT_SLUG_TO_ID: Record<string, string> = {
  "bf-sword": "bf-sword",
  "b-f-sword": "bf-sword",
  "recurve-bow": "recurve-bow",
  "needlessly-large-rod": "needlessly-large-rod",
  "tear-of-the-goddess": "tear-of-the-goddess",
  "chain-vest": "chain-vest",
  "negatron-cloak": "negatron-cloak",
  "giants-belt": "giants-belt",
  "giant-s-belt": "giants-belt",
  "sparring-gloves": "sparring-gloves",
  spatula: "spatula",
  frying_pan: "frying-pan",
  "frying-pan": "frying-pan"
};

const IGNORED_ITEM_IDS = new Set(["tft-flex"]);

const BASE_COMPONENT_IDS = new Set(Object.values(COMPONENT_API_TO_ID));

function toWebPath(...parts: string[]) {
  return parts.join("/").replace(/\\/g, "/");
}

async function ensureDirectory(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanGameText(value: string | null | undefined) {
  return cleanText(
    (value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/%i:[^%]*%/g, "")
      .replace(/@([^@]+)@(?:st|nd|rd|th)?/g, (_, token: string) => titleCaseFromSlug(normalizeId(token)))
  );
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.map(cleanText).filter((line): line is string => Boolean(line));
}

function extractTraitBreakpoints(trait: CDragonTrait): { units: number; effect: string }[] {
  const effects = trait.effects ?? [];
  const seen = new Set<number>();
  const out: { units: number; effect: string }[] = [];
  for (const effect of effects) {
    const units = effect.minUnits;
    if (typeof units !== "number" || units < 1 || seen.has(units)) {
      continue;
    }
    seen.add(units);
    out.push({ units, effect: "" });
  }
  out.sort((a, b) => a.units - b.units);
  return out;
}

function titleFromApiName(apiName: string) {
  return titleCaseFromSlug(
    apiName
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/^TFT\d*_?/i, "")
      .replace(/^TFTSet\d*_?/i, "")
      .replace(/^Item_?/i, "")
      .replace(/^Augment_?/i, "")
      .replace(/_/g, "-")
  );
}

function itemIdFromApiNameFallback(apiName: string) {
  return normalizeId(titleFromApiName(apiName)) || normalizeId(apiName);
}

function idFromApiName(apiName: string | null | undefined) {
  if (!apiName) {
    return "";
  }

  return normalizeChampionLookup(
    apiName
      .replace(/^TFT\d*_/i, "")
      .replace(/^TFTSet\d*_/i, "")
      .replace(/^TFT_/i, "")
      .replace(/^Character_/i, "")
  );
}

function championIdFromName(value: string | null | undefined) {
  return normalizeChampionLookup(value ?? "");
}

function augmentIdFromName(value: string | null | undefined) {
  return normalizeId(value ?? "");
}

function normalizeSourceTier(value: string | null | undefined) {
  const normalized = cleanText(value).toUpperCase();
  if (AUGMENT_RANKS.includes(normalized as (typeof AUGMENT_RANKS)[number])) {
    return normalized;
  }
  if (normalized === "1" || normalized === "SILVER") return "B";
  if (normalized === "2" || normalized === "GOLD") return "A";
  if (normalized === "3" || normalized === "PRISMATIC") return "S";
  return "Unknown";
}

function cdragonAssetUrl(rawPath: string | null | undefined) {
  if (!rawPath) {
    return null;
  }
  return `${CDRAGON_GAME_BASE_URL}${rawPath.toLowerCase().replace(/^assets\//, "assets/").replace(/\.tex$/i, ".png")}`;
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchTextWithRetries(url: string, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
    }
  }

  throw lastError;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function queueAsset(
  assetDownloads: AssetDownload[],
  sourceUrl: string | null,
  group: "champions" | "synergies" | "augments" | "items",
  id: string
) {
  const webPath = toWebPath("assets", group, `${id}.png`);
  if (!sourceUrl) {
    return webPath;
  }

  assetDownloads.push({
    url: sourceUrl,
    webPath,
    filePath: path.join(PUBLIC_DIR, webPath)
  });
  return webPath;
}

async function downloadAssets(downloads: AssetDownload[]) {
  const uniqueDownloads = new Map<string, AssetDownload>();
  for (const download of downloads) {
    uniqueDownloads.set(download.webPath, download);
  }

  await Promise.all(
    [...uniqueDownloads.values()].map(async (download) => {
      if (await fileExists(download.filePath)) {
        return;
      }

      await ensureDirectory(path.dirname(download.filePath));
      const response = await fetch(download.url, { headers: REQUEST_HEADERS });
      if (!response.ok) {
        console.warn(`Asset fetch failed for ${download.webPath}: ${response.status}`);
        return;
      }
      await fs.writeFile(download.filePath, Buffer.from(await response.arrayBuffer()));
    })
  );
}

function extractBalancedValue(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  let index = markerIndex + marker.length;
  while (/\s/.test(source[index])) {
    index += 1;
  }

  const opener = source[index];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : null;
  if (!closer) {
    return null;
  }

  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(index, cursor + 1);
      }
    }
  }

  return null;
}

function extractPreloadedState(html: string) {
  const match = html.match(/window\.__PRELOADED_STATE__=(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) {
    throw new Error("Mobalytics preloaded state was not found.");
  }
  return JSON.parse(match[1]) as any;
}

function parseHtmlDocument(html: string) {
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, { virtualConsole }).window.document;
}

export function parseTftAcademyTierMap(html: string) {
  const document = parseHtmlDocument(html);
  const tiersBySlug: Record<string, string> = {};

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href*="/tierlist/comps/"]')) {
    const href = link.getAttribute("href") ?? "";
    const slug = href.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (!slug) {
      continue;
    }

    const imageAlt = [...link.querySelectorAll("img")]
      .map((image) => cleanText(image.getAttribute("alt")))
      .find((alt) => /\b[XSABCD]\s*Tier\b/i.test(alt));
    const match = imageAlt?.match(/\b(X|S|A|B|C|D)\s*Tier\b/i);
    if (match) {
      tiersBySlug[slug] = match[1].toUpperCase();
    }
  }

  return tiersBySlug;
}

export function parseTftAcademyDetailTier(html: string) {
  const document = parseHtmlDocument(html);
  for (const image of document.querySelectorAll("img")) {
    const alt = cleanText(image.getAttribute("alt"));
    const match = alt.match(/\b(X|S|A|B|C|D)\s*Tier\b/i);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return "";
}

function derefApollo(cache: Record<string, any>, value: any, seen = new Set<string>()): any {
  if (Array.isArray(value)) {
    return value.map((entry) => derefApollo(cache, entry, seen));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (typeof value.__ref === "string") {
    if (seen.has(value.__ref)) {
      return null;
    }
    seen.add(value.__ref);
    return derefApollo(cache, cache[value.__ref], seen);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, derefApollo(cache, entry, new Set(seen))])
  );
}

function buildSourceUnitFromChampionId(
  championId: string,
  itemIds: string[] = [],
  boardIndex?: number,
  starLevel?: number
): SourceUnit | null {
  if (!championId) {
    return null;
  }
  return { championId, itemIds, boardIndex, starLevel };
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildCatalogs(cdragon: CDragonTftData, mobalytics: MobalyticsLookups, teamPlanner: TeamPlannerData): Catalogs {
  const assetDownloads: AssetDownload[] = [];
  const setData =
    cdragon.setData?.find((set) => set.number === CURRENT_SET || set.mutator === `TFTSet${CURRENT_SET}`) ?? {};
  const teamPlannerCodeByChampionId: Record<string, number> = {};
  for (const champion of teamPlanner[`TFTSet${CURRENT_SET}`] ?? []) {
    const code = Number(champion.team_planner_code);
    if (!Number.isFinite(code) || code < 1) {
      continue;
    }

    const championId = idFromApiName(champion.character_id) || championIdFromName(champion.display_name);
    if (championId) {
      teamPlannerCodeByChampionId[championId] = code;
    }
  }

  const setItemApiNames = new Set([...(setData.items ?? []), ...(setData.augments ?? [])]);
  const allItems = cdragon.items ?? [];
  const itemByApiName = Object.fromEntries(
    allItems
      .filter((item): item is CDragonItem & { apiName: string } => Boolean(item.apiName))
      .map((item) => [item.apiName, item])
  );
  const itemByNameLookup = Object.fromEntries(
    allItems
      .filter((item): item is CDragonItem & { name: string } => Boolean(item.name))
      .map((item) => [normalizeAugmentLookup(item.name), item])
  );

  const itemIdByApiName: Record<string, string> = {};
  const itemNameById: Record<string, string> = {};
  const itemRecipeById: Record<string, [string, string]> = { ...COMPONENT_RECIPES };

  for (const [apiName, componentId] of Object.entries(COMPONENT_API_TO_ID)) {
    itemIdByApiName[apiName] = componentId;
    itemNameById[componentId] = COMPONENT_LABELS[componentId] ?? titleCaseFromSlug(componentId);
  }

  for (const item of allItems) {
    if (!item.apiName) {
      continue;
    }
    const itemId = item.name ? normalizeId(item.name) : itemIdFromApiNameFallback(item.apiName);
    itemIdByApiName[item.apiName] = itemId;
    itemNameById[itemId] = cleanText(item.name) || titleFromApiName(item.apiName);
  }

  for (const item of allItems) {
    if (!item.apiName || !item.name || !item.composition?.length) {
      continue;
    }
    const recipe = item.composition
      .map((apiName) => COMPONENT_API_TO_ID[apiName] ?? itemIdByApiName[apiName])
      .filter((id): id is string => BASE_COMPONENT_IDS.has(id));
    if (recipe.length === 2) {
      itemRecipeById[itemIdByApiName[item.apiName] ?? normalizeId(item.name)] = [recipe[0], recipe[1]];
    }
  }

  const championsById: Dataset["championsById"] = {};
  const championRoles: Record<string, string> = {};
  for (const champion of cdragon.sets?.[String(CURRENT_SET)]?.champions ?? []) {
    if (!champion.apiName || !champion.name) {
      continue;
    }

    const id = idFromApiName(champion.apiName);
    if (!id) {
      continue;
    }

    const mobalyticsChampion = mobalytics.championsById[id];
    const unlock = mobalytics.championUnlocksById[id];
    championRoles[id] = champion.role ?? "";
    championsById[id] = {
      id,
      name: champion.name,
      cost: champion.cost ?? 1,
      traitIds: (champion.traits ?? []).map((trait) => normalizeId(trait)),
      abilityName: champion.ability?.name || `${champion.name} ability`,
      abilityDesc: cleanGameText(champion.ability?.desc) || "",
      requiresUnlock: unlock?.requiresUnlock ?? false,
      unlockCondition: unlock?.unlockCondition ?? null,
      recommendedItemIds: mobalyticsChampion?.recommendedItemIds ?? [],
      stats: {
        hp: champion.stats?.hp ?? null,
        mana: champion.stats?.mana ?? null,
        initialMana: champion.stats?.initialMana ?? null,
        damage: champion.stats?.damage ?? null,
        range: champion.stats?.range ?? null
      },
      icon: queueAsset(
        assetDownloads,
        mobalyticsChampion?.iconUrl ?? cdragonAssetUrl(champion.tileIcon ?? champion.squareIcon ?? champion.icon),
        "champions",
        id
      )
    };
  }

  for (const [id, champion] of Object.entries(mobalytics.championsById)) {
    if (championsById[id]) {
      continue;
    }

    championRoles[id] = champion.role ?? "";
    championsById[id] = {
      id,
      name: champion.name,
      cost: champion.cost,
      traitIds: champion.traitIds,
      abilityName: champion.abilityName,
      abilityDesc: champion.abilityDesc,
      requiresUnlock: champion.requiresUnlock,
      unlockCondition: champion.unlockCondition,
      recommendedItemIds: champion.recommendedItemIds,
      stats: champion.stats,
      icon: queueAsset(assetDownloads, champion.iconUrl, "champions", id)
    };
  }

  const synergiesById: Dataset["synergiesById"] = {};
  const synergyNameByApiName: Record<string, string> = {};
  for (const trait of cdragon.sets?.[String(CURRENT_SET)]?.traits ?? []) {
    if (!trait.name) {
      continue;
    }
    if (trait.apiName) {
      synergyNameByApiName[trait.apiName] = trait.name;
    }
    const id = normalizeId(trait.name);
    if (!id || synergiesById[id]) {
      continue;
    }
    synergiesById[id] = {
      id,
      name: trait.name,
      icon: queueAsset(assetDownloads, cdragonAssetUrl(trait.icon), "synergies", id),
      description: cleanText(trait.desc ?? ""),
      breakpoints: extractTraitBreakpoints(trait)
    };
  }

  const itemsById: Dataset["itemsById"] = {};
  const augmentApiNamesSet = new Set(setData.augments ?? []);
  const componentApiNamesSet = new Set(Object.keys(COMPONENT_API_TO_ID));
  for (const item of allItems) {
    if (!item.apiName || !item.icon) {
      continue;
    }
    if (augmentApiNamesSet.has(item.apiName)) {
      continue;
    }
    const itemName = cleanText(item.name) || titleFromApiName(item.apiName);
    const isRuntimeItem =
      setItemApiNames.has(item.apiName) ||
      /^TFT(?:\d+)?_(?:Item|Consumable|GravesTrait|Favored)/i.test(item.apiName) ||
      componentApiNamesSet.has(item.apiName) ||
      item.icon.includes("/Item_Icons/");
    if (!isRuntimeItem) {
      continue;
    }
    const id = itemIdByApiName[item.apiName] ?? normalizeId(itemName);
    if (!id || itemsById[id]) {
      continue;
    }
    itemsById[id] = {
      id,
      name: itemName,
      description: cleanGameText(item.desc),
      icon: queueAsset(assetDownloads, cdragonAssetUrl(item.icon), "items", id),
      ...(itemRecipeById[id] ? { recipeIds: itemRecipeById[id] } : {})
    };
  }

  const augmentsById: Dataset["augmentsById"] = {};
  const augmentIdByApiName: Record<string, string> = {};
  const augmentIdByLookup: Record<string, string> = {};
  for (const apiName of setData.augments ?? []) {
    const item = itemByApiName[apiName];
    if (!item?.name) {
      continue;
    }

    const id = augmentIdFromName(item.name);
    const mobalyticsRank = mobalytics.augmentRankByApi[apiName];
    augmentsById[id] = {
      id,
      name: item.name,
      tier: normalizeTierRank(mobalyticsRank),
      description: cleanGameText(mobalytics.augmentDescriptionByApi[apiName] || item.desc || ""),
      icon: queueAsset(assetDownloads, cdragonAssetUrl(item.icon), "augments", id)
    };
    augmentIdByApiName[apiName] = id;
    augmentIdByLookup[normalizeAugmentLookup(item.name)] = id;
  }

  for (const [apiName, name] of Object.entries(mobalytics.augmentNameByApi)) {
    const id = augmentIdByApiName[apiName] ?? augmentIdFromName(name);
    const sourceItem = itemByApiName[apiName] ?? itemByNameLookup[normalizeAugmentLookup(name)];
    if (!augmentsById[id]) {
      augmentsById[id] = {
        id,
        name,
        tier: normalizeTierRank(mobalytics.augmentRankByApi[apiName]),
        description: cleanGameText(mobalytics.augmentDescriptionByApi[apiName] || sourceItem?.desc || ""),
        icon: queueAsset(assetDownloads, cdragonAssetUrl(sourceItem?.icon), "augments", id)
      };
    } else if (augmentsById[id].tier === "Unknown") {
      augmentsById[id].tier = normalizeTierRank(mobalytics.augmentRankByApi[apiName]);
    }
    augmentIdByApiName[apiName] = id;
    augmentIdByLookup[normalizeAugmentLookup(name)] = id;
  }

  return {
    championsById,
    synergiesById,
    augmentsById,
    itemsById,
    championRoles,
    teamPlannerCodeByChampionId,
    synergyNameByApiName,
    itemIdByApiName,
    itemNameById,
    itemRecipeById,
    augmentIdByApiName,
    augmentIdByLookup,
    assetDownloads
  };
}

function itemIdFromSource(value: string | null | undefined, catalogs: Pick<Catalogs, "itemIdByApiName">) {
  if (!value) {
    return "";
  }
  const cleaned = value
    .replace(/\?.*$/, "")
    .replace(/\.(?:tft_set\d+|tft_tft\d+(?:_\d+)?|tft\d+_\d+)\.png$/i, "")
    .replace(/\.(?:png|webp|jpg|jpeg)$/i, "")
    .replace(/\.(?:tft_set\d+|tft_tft\d+(?:_\d+)?|tft\d+_\d+)$/i, "");
  const normalized = normalizeId(cleaned);
  if (IGNORED_ITEM_IDS.has(normalized)) {
    return "";
  }

  const direct = catalogs.itemIdByApiName[value] ?? catalogs.itemIdByApiName[cleaned];
  if (direct) {
    return direct;
  }

  const sourceCompact = normalized.replace(/^tft-?\d*-item-/, "").replace(/-/g, "");
  const apiMatch = Object.entries(catalogs.itemIdByApiName).find(([apiName]) => {
    const apiCompact = normalizeId(apiName)
      .replace(/^tft-?\d*-item-/, "")
      .replace(/-/g, "");
    return apiCompact === sourceCompact;
  });
  if (apiMatch) {
    return apiMatch[1];
  }

  const emblemMatch = cleaned.match(/^TFT\d+_Emblem_(?<trait>.+)$/i);
  if (emblemMatch?.groups?.trait) {
    const traitSlug = normalizeId(emblemMatch.groups.trait.replace(/([a-z0-9])([A-Z])/g, "$1-$2"));
    return `${traitSlug}-emblem`;
  }

  return normalized;
}

function sourceAugmentId(augment: SourceAugment, catalogs: Pick<Catalogs, "augmentIdByApiName" | "augmentIdByLookup">) {
  if (augment.apiName && catalogs.augmentIdByApiName[augment.apiName]) {
    return catalogs.augmentIdByApiName[augment.apiName];
  }
  if (augment.name && catalogs.augmentIdByLookup[normalizeAugmentLookup(augment.name)]) {
    return catalogs.augmentIdByLookup[normalizeAugmentLookup(augment.name)];
  }
  if (augment.slug && catalogs.augmentIdByLookup[normalizeAugmentLookup(augment.slug)]) {
    return catalogs.augmentIdByLookup[normalizeAugmentLookup(augment.slug)];
  }
  return augmentIdFromName(augment.name ?? augment.slug ?? augment.apiName ?? "");
}

function mobalyticsCanonicalItemId(slug: string | null | undefined, name: string | null | undefined) {
  const normalizedSlug = normalizeId(slug ?? "");
  if (MOBALYTICS_COMPONENT_SLUG_TO_ID[normalizedSlug]) {
    return MOBALYTICS_COMPONENT_SLUG_TO_ID[normalizedSlug];
  }

  return normalizeId(name) || normalizedSlug;
}

function buildMobalyticsItemIdBySlug(stat: Record<string, any>) {
  const itemIdBySlug: Record<string, string> = {};
  for (const [key, raw] of Object.entries(stat)) {
    if (!key.startsWith("GameItemsV1DataFlatDto")) {
      continue;
    }

    const item = raw as any;
    if (item.gameSet !== `set${CURRENT_SET}`) {
      continue;
    }

    const slug = normalizeId(item.slug);
    const itemId = mobalyticsCanonicalItemId(item.slug, item.name);
    if (slug && itemId) {
      itemIdBySlug[slug] = itemId;
    }
  }
  return itemIdBySlug;
}

function mobalyticsItemIdFromRecord(item: any, itemIdBySlug: Record<string, string>): string {
  const flatItem = item?.flatData ?? item;
  const normalizedSlug = normalizeId(flatItem?.slug);
  return itemIdBySlug[normalizedSlug] ?? mobalyticsCanonicalItemId(flatItem?.slug, flatItem?.name);
}

function mobalyticsRecommendedItemIds(champion: any, itemIdBySlug: Record<string, string>): string[] {
  return [
    ...new Set<string>(
      (champion.recommendedItems ?? [])
        .map((item: any) => mobalyticsItemIdFromRecord(item, itemIdBySlug))
        .filter((itemId: string): itemId is string => Boolean(itemId))
    )
  ];
}

type MobalyticsChampionSeed = { id: string; slug: string };
type MobalyticsRecommendedItemScore = {
  itemId: string;
  count: number;
  firstSeen: number;
};
type MobalyticsRecommendedItemScoresByChampion = Record<
  string,
  Record<string, MobalyticsRecommendedItemScore>
>;

function addMobalyticsRecommendedItems(
  scoresByChampion: MobalyticsRecommendedItemScoresByChampion,
  championSlug: string | null | undefined,
  rawItems: any[] | null | undefined,
  itemIdBySlug: Record<string, string>,
  sequence: { current: number }
) {
  const championId = championIdFromName(championSlug);
  if (!championId || !Array.isArray(rawItems) || rawItems.length === 0) {
    return;
  }

  const seenInHolder = new Set<string>();
  for (const rawItem of rawItems) {
    const itemId = mobalyticsItemIdFromRecord(rawItem, itemIdBySlug);
    if (!itemId || seenInHolder.has(itemId)) {
      continue;
    }
    seenInHolder.add(itemId);

    const scores = (scoresByChampion[championId] ??= {});
    const existing = scores[itemId];
    if (existing) {
      existing.count += 1;
    } else {
      scores[itemId] = { itemId, count: 1, firstSeen: sequence.current };
      sequence.current += 1;
    }
  }
}

function collectMobalyticsFormationRecommendedItems(
  scoresByChampion: MobalyticsRecommendedItemScoresByChampion,
  formation: any,
  itemIdBySlug: Record<string, string>,
  sequence: { current: number }
) {
  for (const position of formation?.positions ?? []) {
    const championWithItems = position?.champion;
    addMobalyticsRecommendedItems(
      scoresByChampion,
      championWithItems?.champion?.slug ?? championWithItems?.champion?.name,
      championWithItems?.items,
      itemIdBySlug,
      sequence
    );
  }
}

function collectMobalyticsCompRecommendedItems(
  scoresByChampion: MobalyticsRecommendedItemScoresByChampion,
  comp: any,
  itemIdBySlug: Record<string, string>,
  sequence: { current: number }
) {
  const guide = comp?.guide;
  collectMobalyticsFormationRecommendedItems(scoresByChampion, comp?.formation, itemIdBySlug, sequence);
  collectMobalyticsFormationRecommendedItems(scoresByChampion, guide?.early?.formation, itemIdBySlug, sequence);
  collectMobalyticsFormationRecommendedItems(scoresByChampion, guide?.mid?.formation, itemIdBySlug, sequence);

  for (const championWithItems of guide?.alternatives?.items ?? []) {
    addMobalyticsRecommendedItems(
      scoresByChampion,
      championWithItems?.champion?.slug ?? championWithItems?.champion?.name,
      championWithItems?.items,
      itemIdBySlug,
      sequence
    );
  }
}

function rankedMobalyticsRecommendedItemIds(scores: Record<string, MobalyticsRecommendedItemScore> | undefined) {
  return Object.values(scores ?? {})
    .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
    .map((score) => score.itemId);
}

function mergeMobalyticsRecommendedItemIds(primaryIds: string[], secondaryIds: string[]) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const itemId of [...primaryIds, ...secondaryIds]) {
    if (!itemId || seen.has(itemId)) {
      continue;
    }
    seen.add(itemId);
    merged.push(itemId);
    if (merged.length >= MOBALYTICS_MAX_RECOMMENDED_ITEMS_PER_CHAMPION) {
      break;
    }
  }
  return merged;
}

async function loadMobalyticsChampionPageRecommendedItemIds(
  champions: MobalyticsChampionSeed[],
  itemIdBySlug: Record<string, string>
) {
  const scoresByChampion: MobalyticsRecommendedItemScoresByChampion = {};
  const sequence = { current: 0 };
  const processedCompositionIds = new Set<string>();

  await mapWithConcurrency(champions, 8, async (champion) => {
    try {
      const url = `https://mobalytics.gg/tft/champions/${champion.slug}`;
      const state = extractPreloadedState(await fetchTextWithRetries(url));
      const dynamic = state.tftState?.apollo?.dynamic ?? {};
      const stat = state.tftState?.apollo?.static ?? {};
      const allCache = { ...stat, ...dynamic };

      for (const [key, raw] of Object.entries(dynamic)) {
        if (!key.startsWith("TftComposition:")) {
          continue;
        }

        const comp = derefApollo(allCache, raw);
        const compositionId = cleanText(comp?.id ?? comp?.guide?.compositionId ?? key);
        if (compositionId && processedCompositionIds.has(compositionId)) {
          continue;
        }
        if (compositionId) {
          processedCompositionIds.add(compositionId);
        }

        collectMobalyticsCompRecommendedItems(scoresByChampion, comp, itemIdBySlug, sequence);
      }
    } catch (error) {
      console.warn(`Mobalytics champion item scrape failed for ${champion.slug}:`, error);
    }
  });

  return Object.fromEntries(
    Object.entries(scoresByChampion).map(([championId, scores]) => [
      championId,
      rankedMobalyticsRecommendedItemIds(scores)
    ])
  );
}

export function extractMobalyticsLevelingLines(tag: any, cache?: Record<string, any>): string[] {
  const levelling = Array.isArray(tag?.levelling) ? tag.levelling : Array.isArray(tag?.leveling) ? tag.leveling : [];

  return levelling
    .map((rawEntry: any) => {
      const entry = cache ? derefApollo(cache, rawEntry) : rawEntry;
      const level = Number(entry?.level);
      const stage = cleanText(entry?.stage ?? entry?.round);
      if (!Number.isFinite(level) || !stage) {
        return "";
      }

      const gold = Number(entry?.preserveMoney ?? entry?.minimumGold ?? entry?.minGold ?? entry?.gold);
      const goldText = Number.isFinite(gold) ? ` with ${Math.round(gold)}+ gold` : "";
      const description = cleanText(entry?.description ?? entry?.note);
      return `Level ${Math.round(level)} at ${stage}${goldText}${description ? ` - ${description}` : ""}`;
    })
    .filter(Boolean);
}

function buildMobalyticsLevelingLinesByPlaystyle(stat: Record<string, any>, allCache: Record<string, any>) {
  const levelingLinesByPlaystyle: Record<string, string[]> = {};

  for (const [key, raw] of Object.entries(stat)) {
    if (!key.startsWith("TeamCompTagsV1")) {
      continue;
    }

    const tagRecord = derefApollo(allCache, raw);
    const tag = derefApollo(allCache, tagRecord.flatData ?? tagRecord);
    if (tag.gameSet && tag.gameSet !== `set${CURRENT_SET}`) {
      continue;
    }

    const lines = extractMobalyticsLevelingLines(tag, allCache);
    if (!lines.length) {
      continue;
    }

    for (const value of [tag.slug, tag.label, tag.name]) {
      const lookupKey = normalizeId(value);
      if (lookupKey) {
        levelingLinesByPlaystyle[lookupKey] = lines;
      }
    }
  }

  return levelingLinesByPlaystyle;
}

function normalizeSourceUnits(
  units: Array<{ apiName?: string; boardIndex?: number; items?: string[]; name?: string; stars?: number; starLevel?: number }> | undefined,
  catalogs: Pick<Catalogs, "itemIdByApiName">
) {
  return (units ?? [])
    .map((unit) => {
      const rawStarLevel = Number(unit.stars ?? unit.starLevel);
      const starLevel =
        Number.isFinite(rawStarLevel) && rawStarLevel >= 1 && rawStarLevel <= 3 ? Math.round(rawStarLevel) : undefined;

      return buildSourceUnitFromChampionId(
        unit.apiName ? idFromApiName(unit.apiName) : championIdFromName(unit.name),
        (unit.items ?? []).map((item) => itemIdFromSource(item, catalogs)).filter(Boolean),
        typeof unit.boardIndex === "number" ? unit.boardIndex : undefined,
        starLevel
      );
    })
    .filter((unit): unit is SourceUnit => Boolean(unit));
}

function mobalyticsBoardIndex(coordinates: unknown) {
  const coordinate = Number(coordinates);
  if (!Number.isFinite(coordinate)) {
    return undefined;
  }

  if (coordinate >= 1 && coordinate <= 28) {
    return coordinate - 1;
  }

  if (coordinate >= 0 && coordinate <= 27) {
    return coordinate;
  }

  return undefined;
}

function mobalyticsPositionToSourceUnit(position: any, itemIdBySlug: Record<string, string>): SourceUnit | null {
  const champion = position.champion?.champion;
  const championId = championIdFromName(champion?.slug ?? champion?.name);
  if (!championId) {
    return null;
  }

  const rawStar =
    position.champion?.level ??
    position.champion?.starLevel ??
    position.champion?.star ??
    position.champion?.stars ??
    position.starLevel ??
    position.star;
  const starLevel = typeof rawStar === "number" && rawStar >= 1 && rawStar <= 3 ? Math.round(rawStar) : undefined;

  return {
    championId,
    boardIndex: mobalyticsBoardIndex(position.coordinates),
    itemIds: (position.champion?.items ?? [])
      .map((item: any) => itemIdBySlug[normalizeId(item.slug)] ?? normalizeId(item.slug))
      .filter(Boolean),
    starLevel
  };
}

function mobalyticsFormationUnits(formation: any, itemIdBySlug: Record<string, string>) {
  return (formation?.positions ?? [])
    .map((position: any) => mobalyticsPositionToSourceUnit(position, itemIdBySlug))
    .filter((unit: SourceUnit | null): unit is SourceUnit => Boolean(unit));
}

function mobalyticsCompFromPreloadedState(state: any, externalId: string) {
  const setKey = `set${CURRENT_SET}`;
  const commonComps = state.tftState?.commonDataStore?.gameSetsData?.[setKey]?.teamCompsInternal ?? [];
  const commonMatch = commonComps.find((comp: any) => comp.id === externalId || comp.guide?.compositionId === externalId);
  if (commonMatch) {
    return commonMatch;
  }

  const dynamic = state.tftState?.apollo?.dynamic ?? {};
  const stat = state.tftState?.apollo?.static ?? {};
  const allCache = { ...stat, ...dynamic };
  for (const [key, raw] of Object.entries(dynamic)) {
    if (!key.startsWith("TftComposition:")) {
      continue;
    }
    const comp = derefApollo(allCache, raw);
    if (comp.id === externalId || comp.guide?.compositionId === externalId) {
      return comp;
    }
  }

  return null;
}

function mobalyticsTipsFromDetail(comp: any): SourceComp["tips"] {
  return compactLines([
    comp.description ? `Overview: ${comp.description}` : null,
    comp.guide?.whenToMake ? `When to make: ${comp.guide.whenToMake}` : null,
    comp.guide?.early?.advice ? `Early: ${comp.guide.early.advice}` : null,
    comp.guide?.mid?.advice ? `Mid: ${comp.guide.mid.advice}` : null
  ]).map((tip) => {
    const [stage, ...parts] = tip.split(":");
    return { stage: cleanText(stage), tip: cleanText(parts.join(":")) };
  });
}

async function mapWithConcurrency<T, U>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<U>) {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

async function hydrateMobalyticsDetailComps(comps: SourceComp[], itemIdBySlug: Record<string, string>) {
  return mapWithConcurrency(comps, 4, async (comp) => {
    try {
      const detailState = extractPreloadedState(await fetchTextWithRetries(comp.url));
      const detailComp = mobalyticsCompFromPreloadedState(detailState, comp.externalId);
      if (!detailComp) {
        return comp;
      }

      const detailFinalUnits = mobalyticsFormationUnits(detailComp.formation, itemIdBySlug);
      const detailEarlyUnits = mobalyticsFormationUnits(detailComp.guide?.early?.formation, itemIdBySlug);
      const detailMidUnits = mobalyticsFormationUnits(detailComp.guide?.mid?.formation, itemIdBySlug);
      return {
        ...comp,
        finalUnits: detailFinalUnits.length ? detailFinalUnits : comp.finalUnits,
        units: detailFinalUnits.length ? detailFinalUnits : comp.units,
        earlyUnits: detailEarlyUnits.length ? detailEarlyUnits : comp.earlyUnits,
        midUnits: detailMidUnits.length ? detailMidUnits : comp.midUnits,
        tips: mobalyticsTipsFromDetail(detailComp)
      };
    } catch (error) {
      console.warn(`Mobalytics detail hydrate failed for ${comp.url}:`, error);
      return comp;
    }
  });
}

async function loadMobalyticsLookups(): Promise<MobalyticsLookups> {
  const html = await fetchText(MOBALYTICS_COMPS_URL);
  const state = extractPreloadedState(html);
  const dynamic = state.tftState?.apollo?.dynamic ?? {};
  const stat = state.tftState?.apollo?.static ?? {};
  const allCache = { ...stat, ...dynamic };

  const augmentRankByApi: Record<string, string> = {};
  const augmentRankBySlug: Record<string, string> = {};
  const augmentNameByApi: Record<string, string> = {};
  const augmentDescriptionByApi: Record<string, string> = {};
  const itemIdBySlug = buildMobalyticsItemIdBySlug(stat);
  const levelingLinesByPlaystyle = buildMobalyticsLevelingLinesByPlaystyle(stat, allCache);
  for (const [key, raw] of Object.entries(stat)) {
    if (!key.startsWith("HextechAugmentsDataFlatDto")) {
      continue;
    }
    const augment = raw as any;
    if (augment.gameSet !== `set${CURRENT_SET}`) {
      continue;
    }
    const apiName = cleanText(augment.riotapi);
    const name = cleanText(augment.name);
    const rank = normalizeSourceTier(augment.statsTier);
    if (apiName) {
      augmentRankByApi[apiName] = rank;
      augmentNameByApi[apiName] = name || titleFromApiName(apiName);
      augmentDescriptionByApi[apiName] = cleanGameText(augment.hextechBonus);
    }
    if (augment.slug) {
      augmentRankBySlug[normalizeAugmentLookup(augment.slug)] = rank;
    }
  }

  const championUnlocksById: MobalyticsLookups["championUnlocksById"] = {};
  const championsById: MobalyticsLookups["championsById"] = {};
  const championPageSeeds: MobalyticsChampionSeed[] = [];
  for (const [key, raw] of Object.entries(stat)) {
    if (!key.startsWith("ChampionsV1DataFlatDto")) {
      continue;
    }
    const champion = derefApollo(allCache, raw);
    if (champion.gameSet !== `set${CURRENT_SET}`) {
      continue;
    }
    const id = championIdFromName(champion.slug ?? champion.name);
    if (!id) {
      continue;
    }
    const slug = normalizeId(champion.slug ?? champion.name);
    championUnlocksById[id] = {
      requiresUnlock: Boolean(champion.isUnlockable || champion.unlockCondition),
      unlockCondition: cleanText(champion.unlockCondition) || null
    };
    const ability = champion.abilities?.[0]?.flatData ?? champion.abilities?.[0] ?? {};
    championsById[id] = {
      id,
      name: cleanText(champion.name) || titleCaseFromSlug(id),
      cost: Number.isFinite(Number(champion.cost)) ? Number(champion.cost) : 1,
      traitIds: (champion.synergies ?? [])
        .map((synergy: any) => normalizeId(synergy.flatData?.slug ?? synergy.slug ?? synergy.name))
        .filter(Boolean),
      abilityName: cleanText(ability.name) || `${cleanText(champion.name) || titleCaseFromSlug(id)} ability`,
      abilityDesc: cleanGameText(ability.description),
      requiresUnlock: Boolean(champion.isUnlockable || champion.unlockCondition),
      unlockCondition: cleanText(champion.unlockCondition) || null,
      recommendedItemIds: mobalyticsRecommendedItemIds(champion, itemIdBySlug),
      role: cleanText(champion.role),
      stats: {
        hp: numberOrNull(champion.health ?? champion.hp),
        mana: numberOrNull(champion.mana),
        initialMana: numberOrNull(champion.initialMana),
        damage: numberOrNull(champion.damage),
        range: numberOrNull(champion.attackRange ?? champion.range)
      },
      iconUrl: slug ? `https://cdn.mobalytics.gg/assets/tft/images/champions/icons/set${CURRENT_SET}/${slug}.png?v=5` : null
    };
    if (slug) {
      championPageSeeds.push({ id, slug });
    }
  }

  const championPageRecommendedItemsById = await loadMobalyticsChampionPageRecommendedItemIds(
    championPageSeeds,
    itemIdBySlug
  );
  for (const [championId, recommendedItemIds] of Object.entries(championPageRecommendedItemsById)) {
    const champion = championsById[championId];
    if (!champion) {
      continue;
    }
    champion.recommendedItemIds = mergeMobalyticsRecommendedItemIds(champion.recommendedItemIds, recommendedItemIds);
  }

  const comps = await hydrateMobalyticsDetailComps(
    Object.entries(dynamic)
    .filter(([key]) => key.startsWith("TftComposition:"))
    .map(([key, raw]) => {
      const comp = derefApollo(allCache, raw);
      const guide = derefApollo(allCache, comp.guide);
      const earlyUnits = mobalyticsFormationUnits(guide?.early?.formation, itemIdBySlug);
      const midUnits = mobalyticsFormationUnits(guide?.mid?.formation, itemIdBySlug);
      const finalUnits = mobalyticsFormationUnits(comp.formation, itemIdBySlug);

      const augments = (guide?.augments?.augments ?? [])
        .map((augment: any) => ({
          slug: cleanText(augment.slug),
          name: cleanText(augment.name)
        }))
        .filter((augment: SourceAugment) => augment.slug || augment.name);

      return {
        source: "mobalytics" as const,
        externalId: comp.id ?? key,
        title: cleanText(comp.name) || titleCaseFromSlug(normalizeId(comp.slug)),
        url: `https://mobalytics.gg/tft/set${CURRENT_SET}/comps-guide/${comp.slug}`,
        tier: cleanText(comp.tier).toUpperCase(),
        playstyle: cleanText(comp.playstyle),
        units: finalUnits,
        earlyUnits,
        midUnits,
        finalUnits,
        augments,
        tips: comp.description ? [{ stage: "Overview", tip: comp.description }] : [],
        levelingLines: levelingLinesByPlaystyle[normalizeId(comp.playstyle)],
        createdAt: comp.createdAt,
        updatedAt: comp.updatedAt
      } satisfies SourceComp;
    }),
    itemIdBySlug
  );

  if (process.env.SKIP_TEAM_CODES !== "1") {
    await populateMobalyticsTeamCodes(comps);
  }

  await ensureDirectory(RAW_DIR);
  await fs.writeFile(
    path.join(RAW_DIR, `mobalytics-set${CURRENT_SET}-snapshot.json`),
    JSON.stringify({ fetchedAt: new Date().toISOString(), compCount: comps.length }, null, 2)
  );

  return {
    comps,
    championsById,
    augmentRankByApi,
    augmentRankBySlug,
    augmentNameByApi,
    augmentDescriptionByApi,
    championUnlocksById
  };
}

async function populateMobalyticsTeamCodes(comps: SourceComp[]) {
  if (comps.length === 0) return;
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("playwright not available; skipping team code scrape");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const page = await ctx.newPage();

    let captured: string | null = null;
    await page.exposeFunction("__captureTeamCode", (value: unknown) => {
      if (typeof value === "string" && /TFTSet\d+/.test(value)) {
        captured = value;
      }
    });
    await page.addInitScript(() => {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text: string) => {
        // @ts-ignore
        window.__captureTeamCode(String(text));
        return orig(text);
      };
    });

    let okCount = 0;
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      captured = null;
      try {
        await page.goto(comp.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const target = page.getByRole("button", { name: /import comp to overlay and copy team code/i });
        await target.first().click({ timeout: 8000 });
        const start = Date.now();
        while (captured === null && Date.now() - start < 4000) {
          await page.waitForTimeout(150);
        }
        if (captured) {
          comp.teamCode = captured;
          okCount += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 80) : String(err);
        console.warn(`team code scrape failed for ${comp.url}: ${message}`);
      }
      if ((i + 1) % 5 === 0 || i + 1 === comps.length) {
        console.log(`  team-code scrape ${i + 1}/${comps.length} (got ${okCount})`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function loadTftAcademySourceComps(catalogs: Pick<Catalogs, "itemIdByApiName">) {
  const html = await fetchText(TFTACADEMY_COMPS_URL);
  const renderedTiersBySlug = parseTftAcademyTierMap(html);
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((entry) => entry.includes("guides:["));
  if (!script) {
    return [];
  }

  const guidesSource = extractBalancedValue(script, "guides:");
  if (!guidesSource) {
    return [];
  }

  const guides = Function(`"use strict"; return (${guidesSource});`)() as any[];
  const missingTierSlugs = guides
    .map((guide) => cleanText(guide.compSlug))
    .filter((slug) => slug && !renderedTiersBySlug[slug]);
  const detailTiersBySlug = Object.fromEntries(
    await Promise.all(
      missingTierSlugs.map(async (slug) => {
        try {
          return [slug, parseTftAcademyDetailTier(await fetchText(`https://tftacademy.com/tierlist/comps/${slug}`))];
        } catch (error) {
          console.warn(`TFT Academy detail rank fetch failed for ${slug}:`, error);
          return [slug, ""];
        }
      })
    )
  );

  return guides.map((guide) => {
    const title = cleanText(guide.metaTitle || guide.title || guide.compSlug);
    const compSlug = cleanText(guide.compSlug);
    const guideTier = normalizeCompTier(guide.tier);
    const renderedTier = normalizeCompTier(renderedTiersBySlug[compSlug] || detailTiersBySlug[compSlug]);
    const finalUnits = normalizeSourceUnits(guide.finalComp, catalogs);
    const earlyUnits = normalizeSourceUnits(guide.earlyComp, catalogs);
    const augments = [guide.mainAugment, ...(guide.augments ?? []), ...(guide.overlayAugments ?? [])]
      .filter((augment: any) => augment && augment.disabled !== true)
      .map((augment: any) => ({ apiName: cleanText(augment.apiName) }))
      .filter((augment: SourceAugment) => Boolean(augment.apiName));

    return {
      source: "tftacademy" as const,
      externalId: cleanText(guide.id || compSlug || title),
      title,
      url: `https://tftacademy.com/tierlist/comps/${compSlug}`,
      tier: guideTier || renderedTier || undefined,
      playstyle: cleanText(guide.style),
      units: finalUnits.length ? finalUnits : earlyUnits,
      earlyUnits,
      finalUnits,
      augments,
      augmentTypes: (guide.augmentTypes ?? []).map((entry: string) => cleanText(entry)).filter(Boolean),
      tips: (guide.tips ?? [])
        .map((tip: any) => ({ stage: cleanText(tip.stage), tip: cleanText(tip.tip) }))
        .filter((tip: { stage: string; tip: string }) => tip.stage || tip.tip),
      augmentsTip: cleanText(guide.augmentsTip),
      mainChampionId: idFromApiName(guide.mainChampion?.apiName),
      mainItemId: itemIdFromSource(guide.mainItem?.apiName, catalogs),
      createdAt: guide.created,
      updatedAt: guide.updated
    } satisfies SourceComp;
  }).filter((comp) => comp.externalId && !comp.title.toLowerCase().includes("(copy)"));
}

async function loadTftacticsSourceComps() {
  const html = await fetchText(TFTACTICS_COMPS_URL);
  const document = parseHtmlDocument(html);

  return [...document.querySelectorAll(".team-portrait")]
    .map((card, index) => {
      const title = cleanText(card.querySelector(".team-name-elipsis")?.childNodes.item(0)?.textContent);
      const tier = cleanText(card.querySelector(".team-rank")?.textContent);
      const playstyle = cleanText(card.querySelector(".team-playstyle")?.textContent);
      const requiresAugment = Boolean(card.querySelector(".team-playstyle.augment"));
      const units = [...card.querySelectorAll(".team-characters > a.characters-item")]
        .map((link) => {
          const championId = championIdFromName(link.querySelector(".team-character-name")?.textContent || link.textContent);
          const itemIds = [...link.querySelectorAll(".character-items .character-wrapper[name]")]
            .map((item) => normalizeId(item.getAttribute("name")))
            .filter(Boolean);
          return buildSourceUnitFromChampionId(championId, itemIds);
        })
        .filter((unit): unit is SourceUnit => Boolean(unit));

      return {
        source: "tftactics" as const,
        externalId: `tftactics-${index}-${normalizeId(title)}`,
        title,
        url: TFTACTICS_COMPS_URL,
        tier,
        playstyle,
        augments: requiresAugment && title ? [{ name: title }] : [],
        augmentTypes: requiresAugment ? ["Augment"] : [],
        augmentsTip: requiresAugment ? `Requires the ${title} augment.` : undefined,
        units,
        finalUnits: units
      } satisfies SourceComp;
    })
    .filter((comp) => comp.title && comp.units.length);
}

function championIdFromTftflowImage(image: Element) {
  const altId = championIdFromName(image.getAttribute("alt"));
  if (altId) {
    return altId;
  }

  const apiName = apiNameFromTftflowAsset(imageAssetUrl(image));
  return idFromApiName(apiName);
}

function imageAssetUrl(image: Element) {
  return (
    image.getAttribute("href") ??
    image.getAttribute("xlink:href") ??
    image.getAttribute("src") ??
    image.getAttribute("data-src") ??
    ""
  );
}

function apiNameFromTftflowAsset(assetUrl: string) {
  const fileName = decodeURIComponent(assetUrl.split(/[?#]/)[0].split("/").pop() ?? "");
  return fileName
    .replace(/\.(?:tft_set\d+\.)?png$/i, "")
    .replace(/\.(?:png|webp|jpg|jpeg)$/i, "")
    .replace(/_square.*$/i, "");
}

function itemIdFromTftflowImage(image: Element, catalogs: Pick<Catalogs, "itemIdByApiName">) {
  const href = imageAssetUrl(image);
  const apiName = cleanText(image.getAttribute("data-item-apiname")) || apiNameFromTftflowAsset(href);
  return itemIdFromSource(apiName, catalogs);
}

function isTftflowChampionImage(image: Element) {
  const href = imageAssetUrl(image).toLowerCase();
  return href.includes("/champions/") || href.includes("champion");
}

function isTftflowItemImage(image: Element) {
  const href = imageAssetUrl(image).toLowerCase();
  const apiName = apiNameFromTftflowAsset(href);
  return href.includes("/items/") || /^tft_?item/i.test(apiName) || /^tft\d+_emblem_/i.test(apiName);
}

function parseTftflowTier(document: Document) {
  const selectors = [
    ".builder-comp-options-container .tier-dropdown-label",
    ".builder-comp-options-container .tier-icon-button",
    ".tier-dropdown-label",
    ".comp-tier",
    "[class*='tier']"
  ];

  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const text = cleanText(element.textContent).replace(/Tier$/i, "").trim();
      const match = text.match(/\b(S\+?|A\+?|B\+?|C\+?|D)\b/i);
      if (match) {
        return match[1].toUpperCase();
      }
    }
  }

  return "";
}

function parseTftflowAugmentTypes(document: Document) {
  return cleanText(document.querySelector(".comp-augment-priority")?.textContent)
    .split(/[+/,&]/)
    .map(cleanText)
    .filter(Boolean);
}

function parseTftflowConditionName(text: string) {
  const name = cleanText(text)
    .replace(/\b[SABCD]\+?\s*(?:->|→)\s*[SABCD]\+?.*$/i, "")
    .split(/:|(?:->)|(?:→)/)[0]
    .replace(/^\+\d+\s*/, "")
    .trim();
  return name;
}

function parseTftflowAugments(document: Document): SourceAugment[] {
  const augments = new Map<string, SourceAugment>();
  const addAugment = (augment: SourceAugment) => {
    const apiName = cleanText(augment.apiName);
    const name = cleanText(augment.name);
    if (!apiName && (!name || /augment priority/i.test(name))) {
      return;
    }

    const key = apiName || normalizeAugmentLookup(name);
    if (!key || augments.has(key)) {
      return;
    }
    augments.set(key, { apiName: apiName || undefined, name: name || undefined });
  };

  for (const element of document.querySelectorAll("[data-augment-apiname]")) {
    const apiName = cleanText(element.getAttribute("data-augment-apiname"));
    const name =
      cleanText(element.getAttribute("alt")) ||
      cleanText(element.closest(".condition-item, [class*='condition-item']")?.querySelector(".modal-item-name")?.textContent) ||
      parseTftflowConditionName(element.closest(".condition-item, [class*='condition-item']")?.textContent ?? "");

    addAugment({ apiName, name });
  }

  for (const element of document.querySelectorAll(".augment-name, [class*='augment-name']")) {
    const name = cleanText(element.textContent);
    addAugment({ name });
  }

  for (const element of document.querySelectorAll(".condition-card, .condition-li-content, [class*='condition-card']")) {
    const name = parseTftflowConditionName(element.textContent ?? "");
    if (name && !/emblem$/i.test(name)) {
      addAugment({ name });
    }
  }

  return [...augments.values()];
}

function parseTftflowTips(document: Document) {
  const tips: SourceComp["tips"] = [];

  for (const element of document.querySelectorAll(".tips-li-content, [class*='tips-li-content']")) {
    const tip = cleanText(element.textContent);
    if (tip) {
      tips.push({ stage: "TFTFlow tips", tip });
    }
  }

  for (const element of document.querySelectorAll(".condition-card, .condition-li-content, [class*='condition-card']")) {
    const tip = cleanText(element.textContent);
    if (tip) {
      tips.push({ stage: "Strong conditions", tip });
    }
  }

  return tips;
}

function parseTftflowLevelingLines(document: Document) {
  return [...document.querySelectorAll(".econ-li-content, [class*='econ-li-content']")]
    .map((element) => cleanText(element.textContent))
    .filter(Boolean);
}

function parseTftflowBoardUnits(board: Element | null, catalogs: Pick<Catalogs, "itemIdByApiName">) {
  if (!board) {
    return [];
  }

  const containers = [...board.querySelectorAll(".board-unit, .unit-container, [data-champion-apiname], g, div")].filter(
    (container) => [...container.querySelectorAll("image, img")].filter(isTftflowChampionImage).length === 1
  );
  if (!containers.length) {
    return [...board.querySelectorAll("image, img")]
      .filter(isTftflowChampionImage)
      .map((image, index) => buildSourceUnitFromChampionId(championIdFromTftflowImage(image), [], index))
      .filter((unit): unit is SourceUnit => Boolean(unit));
  }

  return containers
    .map((container, index) => {
      const images = [...container.querySelectorAll("image, img")];
      const championImage = images.find(isTftflowChampionImage);
      if (!championImage) {
        return null;
      }

      const championId = championIdFromTftflowImage(championImage);
      const itemIds = images
        .filter((image) => image !== championImage && isTftflowItemImage(image))
        .map((image) => itemIdFromTftflowImage(image, catalogs))
        .filter(Boolean);

      return buildSourceUnitFromChampionId(championId, itemIds, index);
    })
    .filter((unit): unit is SourceUnit => Boolean(unit));
}

export function parseTftflowDetailHtml(
  html: string,
  url: string,
  index: number,
  catalogs: Pick<Catalogs, "itemIdByApiName">
): SourceComp {
  const detailDocument = parseHtmlDocument(html);
  const detailTitle =
    cleanText(detailDocument.querySelector(".comp-title")?.textContent) ||
    cleanText(detailDocument.querySelector("h1")?.textContent) ||
    `TFTFlow Comp ${index + 1}`;
  const tier = parseTftflowTier(detailDocument);
  const playstyle = cleanText(detailDocument.querySelector(".comp-econ-strategy-label")?.textContent);
  const board = detailDocument.querySelector(".boards-flex-container") ?? detailDocument.querySelector("[class*='boards']");
  const units = uniqueUnits(parseTftflowBoardUnits(board, catalogs));
  const augmentTypes = parseTftflowAugmentTypes(detailDocument);
  const levelingLines = parseTftflowLevelingLines(detailDocument);
  const tips = [
    ...parseTftflowTips(detailDocument),
    ...levelingLines.map((line) => ({ stage: "Levelling guide", tip: line }))
  ];

  return {
    source: "tftflow" as const,
    externalId: `tftflow-${index}-${normalizeId(detailTitle)}`,
    title: detailTitle,
    url,
    tier,
    playstyle,
    units,
    finalUnits: units,
    augments: parseTftflowAugments(detailDocument),
    augmentTypes,
    augmentsTip: augmentTypes.length ? `Preferred augment angle: ${augmentTypes.join(", ")}.` : undefined,
    tips,
    levelingLines
  } satisfies SourceComp;
}

async function loadTftflowDetailComp(
  link: HTMLAnchorElement,
  index: number,
  catalogs: Pick<Catalogs, "itemIdByApiName">
): Promise<SourceComp> {
  const title = cleanText(link.textContent);
  const url = link.href || TFTFLOW_COMPS_URL;
  const fallbackWrapper = link.closest(".comp-card-wrapper") ?? link.parentElement;
  const fallbackUnits = [...(fallbackWrapper?.querySelectorAll("img") ?? [])]
    .map((image) => buildSourceUnitFromChampionId(championIdFromTftflowImage(image)))
    .filter((unit): unit is SourceUnit => Boolean(unit));

  try {
    const parsed = parseTftflowDetailHtml(await fetchText(url), url, index, catalogs);
    const units = parsed.units.length ? parsed.units : uniqueUnits(fallbackUnits);
    return {
      ...parsed,
      units,
      finalUnits: parsed.finalUnits?.length ? parsed.finalUnits : units
    };
  } catch (error) {
    console.warn(`TFTFlow detail fetch failed for ${url}:`, error);
    return {
      source: "tftflow" as const,
      externalId: `tftflow-${index}-${normalizeId(title)}`,
      title,
      url,
      units: uniqueUnits(fallbackUnits),
      finalUnits: uniqueUnits(fallbackUnits)
    } satisfies SourceComp;
  }
}

async function loadTftflowSourceComps(catalogs: Pick<Catalogs, "itemIdByApiName">) {
  const html = await fetchText(TFTFLOW_COMPS_URL);
  const document = parseHtmlDocument(html);

  const links = [...document.querySelectorAll<HTMLAnchorElement>(".meta-tier-comp-link")].filter((link) =>
    Boolean(cleanText(link.textContent))
  );
  const comps = await Promise.all(links.map((link, index) => loadTftflowDetailComp(link, index, catalogs)));
  return comps.filter((comp) => comp.title);
}

type MetaTftNameEntry = {
  name?: string;
  score?: number;
  type?: string;
};

function metaTftNameEntries(cluster: any): MetaTftNameEntry[] {
  return Array.isArray(cluster.name) ? cluster.name : [];
}

function metaTftChampionIdFromSignal(apiName: string | null | undefined, catalogs: Pick<Catalogs, "championsById">) {
  const direct = idFromApiName(apiName);
  if (direct && catalogs.championsById[direct]) {
    return direct;
  }

  const carryMatch = cleanText(apiName).match(/^TFT\d+_Augment_(?<champion>.+?)Carry$/i);
  if (carryMatch?.groups?.champion) {
    const carryChampionId = idFromApiName(`TFT${CURRENT_SET}_${carryMatch.groups.champion}`);
    if (catalogs.championsById[carryChampionId]) {
      return carryChampionId;
    }
  }

  return "";
}

function metaTftSignalTitle(
  apiName: string,
  catalogs: Pick<Catalogs, "championsById" | "synergiesById" | "synergyNameByApiName">
) {
  const championId = metaTftChampionIdFromSignal(apiName, catalogs);
  if (championId) {
    const championName = catalogs.championsById[championId]?.name ?? titleFromApiName(apiName);
    return /_Augment_/i.test(apiName) ? `${championName} Carry` : championName;
  }

  const traitName =
    catalogs.synergyNameByApiName[apiName] ??
    catalogs.synergyNameByApiName[apiName.replace(/_\d+$/, "")] ??
    null;
  if (traitName) {
    return traitName;
  }

  return titleFromApiName(apiName).replace(/^Augment\s+/i, "");
}

function buildMetaTftUrl(cluster: any, entries: MetaTftNameEntry[]) {
  const navId = entries.map((entry) => cleanText(entry.name)).filter(Boolean).join("-");
  return `https://www.metatft.com/comps#${navId || `row_${cluster.Cluster}`}`;
}

function bestMetaTftOption(optionsData: any, clusterId: string) {
  const optionGroups = optionsData?.results?.options?.[clusterId] ?? {};
  const options = Object.entries(optionGroups).flatMap(([level, entries]) =>
    Array.isArray(entries) ? entries.map((entry) => ({ ...entry, parsedLevel: Number(level) || 0 })) : []
  );

  return options
    .filter((entry) => cleanText(entry.units_list))
    .sort(
      (left, right) =>
        Number(right.parsedLevel ?? 0) - Number(left.parsedLevel ?? 0) ||
        Number(right.score ?? 0) - Number(left.score ?? 0) ||
        Number(right.count ?? 0) - Number(left.count ?? 0)
    )[0];
}

function sourceUnitsFromMetaTftOption(option: any, fallbackUnits: SourceUnit[]) {
  const units = cleanText(option?.units_list)
    .split("&")
    .map((entry) => buildSourceUnitFromChampionId(idFromApiName(entry.trim())))
    .filter((unit): unit is SourceUnit => Boolean(unit));

  return units.length ? units : fallbackUnits;
}

function metaTftOverallAverage(augmentData: any, clusterId: string) {
  const value = augmentData?.results?.overall?.[clusterId]?.[0]?.avg;
  return typeof value === "number" ? value : null;
}

function deriveMetaTftTier(avg: number | null, index: number, total: number) {
  if (typeof avg === "number") {
    if (avg <= 4.05) return "S";
    if (avg <= 4.25) return "A";
    if (avg <= 4.5) return "B";
    if (avg <= 4.8) return "C";
    return "D";
  }

  const pct = total <= 1 ? 0 : index / total;
  if (pct <= 0.12) return "S";
  if (pct <= 0.35) return "A";
  if (pct <= 0.7) return "B";
  return "C";
}

function inferMetaTftPlaystyle(
  units: SourceUnit[],
  mainChampionId: string,
  option: any,
  catalogs: Pick<Catalogs, "championsById">
) {
  const coreCost = mainChampionId ? catalogs.championsById[mainChampionId]?.cost : null;
  if (coreCost && coreCost <= 3) {
    return `${coreCost}-Cost Reroll`;
  }
  if (coreCost === 4) {
    return "Fast 8";
  }

  const maxCost = Math.max(...units.map((unit) => catalogs.championsById[unit.championId]?.cost ?? 0), 0);
  const optionLevel = Number(option?.parsedLevel ?? 0);
  if (coreCost === 5 || optionLevel >= 9 || (maxCost >= 5 && units.length >= 8)) {
    return "Fast 9";
  }
  if (maxCost >= 4) {
    return "Fast 8";
  }
  return "Standard";
}

function metaTftBuildItemsByChampion(buildData: any, clusterId: string, catalogs: Pick<Catalogs, "itemIdByApiName">) {
  const builds = buildData?.results?.[clusterId]?.builds ?? [];
  const itemsByChampion = new Map<string, string[]>();

  [...builds]
    .sort(
      (left, right) =>
        Number(right.score ?? right.adjusted_score ?? 0) - Number(left.score ?? left.adjusted_score ?? 0) ||
        Number(right.count ?? 0) - Number(left.count ?? 0)
    )
    .forEach((build) => {
      const championId = idFromApiName(build.unit);
      if (!championId || itemsByChampion.has(championId)) {
        return;
      }

      const itemIds = (Array.isArray(build.buildName) ? (build.buildName as string[]) : [])
        .map((apiName) => itemIdFromSource(apiName, catalogs))
        .filter((itemId): itemId is string => Boolean(itemId))
        .slice(0, 3);

      if (itemIds.length) {
        itemsByChampion.set(championId, itemIds);
      }
    });

  return itemsByChampion;
}

function applyMetaTftItems(units: SourceUnit[], itemsByChampion: Map<string, string[]>) {
  return units.map((unit) => ({
    ...unit,
    itemIds: itemsByChampion.get(unit.championId) ?? unit.itemIds
  }));
}

function ensureReferencedAugments(sourceComps: SourceComp[], catalogs: Catalogs) {
  for (const comp of sourceComps) {
    if (comp.source !== "metatft") {
      continue;
    }
    for (const augment of comp.augments ?? []) {
      const augmentId = sourceAugmentId(augment, catalogs);
      if (!augmentId || catalogs.augmentsById[augmentId]) {
        continue;
      }

      const championId = metaTftChampionIdFromSignal(augment.apiName, catalogs);
      const name = cleanText(augment.name) || titleFromApiName(augment.apiName ?? augment.slug ?? augmentId);
      catalogs.augmentsById[augmentId] = {
        id: augmentId,
        name,
        tier: "Unknown",
        description: `MetaTFT identifies ${name} as a defining augment for this cluster.`,
        icon: championId ? catalogs.championsById[championId].icon : toWebPath("assets", "system", "lock.svg")
      };
      if (augment.apiName) {
        catalogs.augmentIdByApiName[augment.apiName] = augmentId;
      }
      catalogs.augmentIdByLookup[normalizeAugmentLookup(name)] = augmentId;
    }
  }
}

async function loadMetaTftSourceComps(
  catalogs: Pick<Catalogs, "championsById" | "synergiesById" | "synergyNameByApiName" | "itemIdByApiName">
) {
  const data = await fetchJson<any>(METATFT_CLUSTER_URL);
  const [buildData, augmentData, optionsData] = await Promise.all([
    fetchJson<any>(METATFT_BUILD_URL),
    fetchJson<any>(METATFT_AUGMENT_URL),
    fetchJson<any>(METATFT_OPTIONS_URL)
  ]);
  const clusters = data.cluster_info?.cluster_details?.clusters ?? [];

  return clusters.map((cluster: any, index: number) => {
    const clusterId = String(cluster.Cluster);
    const entries = metaTftNameEntries(cluster);
    const fallbackUnits = cleanText(cluster.units_string)
      .split(",")
      .map((entry) => buildSourceUnitFromChampionId(idFromApiName(entry.trim())))
      .filter((unit): unit is SourceUnit => Boolean(unit));
    const option = bestMetaTftOption(optionsData, clusterId);
    const rawUnits = sourceUnitsFromMetaTftOption(option, fallbackUnits);
    const buildItems = metaTftBuildItemsByChampion(buildData, clusterId, catalogs);
    const units = applyMetaTftItems(rawUnits, buildItems);
    const nameParts = entries.map((entry) => metaTftSignalTitle(cleanText(entry.name), catalogs)).filter(Boolean);
    const title = nameParts.length ? nameParts.join(" ") : `MetaTFT Cluster ${cluster.Cluster}`;
    const mainChampionId =
      entries.map((entry) => metaTftChampionIdFromSignal(entry.name, catalogs)).find(Boolean) ??
      units
        .slice()
        .sort(
          (left, right) =>
            (catalogs.championsById[right.championId]?.cost ?? 0) - (catalogs.championsById[left.championId]?.cost ?? 0)
        )[0]?.championId ??
      "";
    const avg = metaTftOverallAverage(augmentData, clusterId);
    const playstyle = inferMetaTftPlaystyle(units, mainChampionId, option, catalogs);
    const topItemId = (mainChampionId && buildItems.get(mainChampionId)?.[0]) || [...buildItems.values()][0]?.[0] || "";
    const augmentSignals = entries
      .filter((entry) => /_Augment_/i.test(cleanText(entry.name)))
      .map((entry) => ({
        apiName: cleanText(entry.name),
        name: metaTftSignalTitle(cleanText(entry.name), catalogs)
      }));
    const topItemUnits = [...buildItems.keys()]
      .slice(0, 3)
      .map((championId) => catalogs.championsById[championId]?.name)
      .filter(Boolean);

    return {
      source: "metatft" as const,
      externalId: clusterId,
      title,
      url: buildMetaTftUrl(cluster, entries),
      tier: deriveMetaTftTier(avg, index, clusters.length),
      playstyle,
      units,
      finalUnits: units,
      augments: augmentSignals,
      augmentTypes: augmentSignals.length ? ["cluster-specific"] : [],
      augmentsTip: augmentSignals.length
        ? `MetaTFT cluster-defining augment: ${augmentSignals.map((augment) => augment.name).join(", ")}.`
        : "",
      tips: compactLines([
        typeof avg === "number" ? `Average placement ${avg.toFixed(2)} in MetaTFT cluster stats.` : null,
        topItemUnits.length ? `Top itemized units from MetaTFT: ${topItemUnits.join(", ")}.` : null,
        `Cluster link opens MetaTFT row ${clusterId}.`
      ]).map((tip) => ({ stage: "Overview", tip })),
      mainChampionId,
      mainItemId: topItemId
    } satisfies SourceComp;
  });
}

function isFrontlineChampion(championId: string, catalogs: Pick<Catalogs, "championsById" | "championRoles">) {
  const role = catalogs.championRoles[championId]?.toLowerCase() ?? "";
  const traits = catalogs.championsById[championId]?.traitIds ?? [];
  return (
    role.includes("tank") ||
    traits.some((trait) =>
      ["brawler", "bulwark", "vanguard", "warden", "defender", "juggernaut", "bastion"].includes(trait)
    )
  );
}

function inferBoardIndexes(units: SourceUnit[], catalogs: Pick<Catalogs, "championsById" | "championRoles">) {
  const used = new Set<number>();
  const front = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  const back = [27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16];

  return units.map((unit) => {
    if (typeof unit.boardIndex === "number" && unit.boardIndex >= 0 && unit.boardIndex <= 27 && !used.has(unit.boardIndex)) {
      used.add(unit.boardIndex);
      return unit;
    }

    const pool = isFrontlineChampion(unit.championId, catalogs) ? front : back;
    const boardIndex = pool.find((index) => !used.has(index)) ?? [...Array(28).keys()].find((index) => !used.has(index)) ?? 0;
    used.add(boardIndex);
    return { ...unit, boardIndex };
  });
}

function uniqueUnits(units: SourceUnit[]) {
  const seen = new Set<string>();
  return units.filter((unit) => {
    if (seen.has(unit.championId)) {
      return false;
    }
    seen.add(unit.championId);
    return true;
  });
}

function unitsToPhaseData(
  sourceUnits: SourceUnit[],
  catalogs: Pick<Catalogs, "championsById" | "synergiesById" | "championRoles">
): PhaseData {
  const boardSlots: BoardSlot[] = Array.from({ length: 28 }, (_, index) => ({
    index,
    championId: null,
    locked: false,
    itemIds: [],
    starLevel: 1
  }));

  const championLevels: Record<string, number> = {};
  for (const unit of inferBoardIndexes(sourceUnits, catalogs)) {
    if (typeof unit.boardIndex !== "number" || unit.boardIndex < 0 || unit.boardIndex > 27) {
      continue;
    }
    if (!catalogs.championsById[unit.championId]) {
      continue;
    }
    boardSlots[unit.boardIndex] = {
      index: unit.boardIndex,
      championId: unit.championId,
      locked: catalogs.championsById[unit.championId].requiresUnlock,
      itemIds: unit.itemIds,
      starLevel: unit.starLevel ?? 1
    };
    if (typeof unit.starLevel === "number" && unit.starLevel > 1) {
      championLevels[unit.championId] = Math.max(championLevels[unit.championId] ?? 1, unit.starLevel);
    }
  }

  const championIds = Array.from(
    new Set(boardSlots.map((slot) => slot.championId).filter((championId): championId is string => Boolean(championId)))
  );
  const synergyIds = Array.from(
    new Set(
      championIds.flatMap((championId) =>
        (catalogs.championsById[championId]?.traitIds ?? []).filter((traitId) => Boolean(catalogs.synergiesById[traitId]))
      )
    )
  );

  return { boardSlots, championIds, synergyIds, championLevels };
}

function buildLevelGuide(playstyle: string | undefined, levelingLines?: string[]): GuideSection {
  if (levelingLines?.length) {
    return {
      title: "Levelling guide",
      lines: levelingLines
    };
  }

  const style = cleanText(playstyle).toLowerCase();
  if (style.includes("1-cost") || style.includes("1 cost")) {
    return {
      title: "Levelling guide",
      lines: [
        "Level 4 at 2-1 - hold pairs",
        "Stay level 5 through 3-1 - slow roll above 50 gold",
        "Level 6 after hitting core 3-stars",
        "Push levels after stabilizing"
      ]
    };
  }
  if (style.includes("2-cost") || style.includes("2 cost")) {
    return {
      title: "Levelling guide",
      lines: [
        "Level 4 at 2-1",
        "Level 5 at 2-5",
        "Level 6 at 3-2 - slow roll above 50 gold",
        "Push level 7 after core 3-stars"
      ]
    };
  }
  if (style.includes("3-cost") || style.includes("3 cost") || style.includes("slow roll")) {
    return {
      title: "Levelling guide",
      lines: [
        "Level 4 at 2-1",
        "Level 5 at 2-5",
        "Level 6 at 3-2",
        "Level 7 at 4-1 - slow roll for carries",
        "Push level 8 after hitting"
      ]
    };
  }
  if (style.includes("9")) {
    return {
      title: "Levelling guide",
      lines: [
        "Level 4 at 2-1",
        "Level 5 at 2-5",
        "Level 6 at 3-2",
        "Level 7 at 4-1",
        "Level 8 at 4-2 - stabilize",
        "Level 9 at 5-2 - cap around 5-costs"
      ]
    };
  }
  return {
    title: "Levelling guide",
    lines: [
      "Level 4 at 2-1",
      "Level 5 at 2-5",
      "Level 6 at 3-2",
      "Level 7 at 4-1",
      "Level 8 at 4-2 - roll for core board"
    ]
  };
}

function sectionsByStage(tips: SourceComp["tips"] | undefined, matcher: RegExp) {
  return (tips ?? [])
    .filter((tip) => matcher.test(tip.stage) || matcher.test(tip.tip))
    .map((tip) => cleanText(tip.tip))
    .filter(Boolean);
}

function evidencePhaseFromText(value: string): ProviderEvidence["phase"] {
  if (/stage 2|early/i.test(value)) {
    return "early";
  }
  if (/stage 3|mid/i.test(value)) {
    return "mid";
  }
  if (/stage 4|stage 5|late|cap/i.test(value)) {
    return "late";
  }
  return "overview";
}

function sourceUnitEvidenceLabel(unit: SourceUnit, catalogs: Pick<Catalogs, "championsById" | "itemNameById">) {
  const champion = catalogs.championsById[unit.championId];
  const championName = champion?.name ?? titleCaseFromSlug(unit.championId);
  const itemNames = unit.itemIds
    .map((itemId) => catalogs.itemNameById[itemId] ?? COMPONENT_LABELS[itemId] ?? titleCaseFromSlug(itemId))
    .filter(Boolean);
  const slot = typeof unit.boardIndex === "number" ? ` slot ${unit.boardIndex + 1}` : "";
  const stars = unit.starLevel && unit.starLevel > 1 ? ` ${unit.starLevel}-star` : "";
  const items = itemNames.length ? ` with ${itemNames.join(", ")}` : "";

  return `${championName}${stars}${slot}${items}`;
}

function buildProviderEvidence(
  comp: SourceComp,
  catalogs: Pick<Catalogs, "championsById" | "itemNameById">
): ProviderEvidence[] {
  const evidence: ProviderEvidence[] = [];
  const pushEvidence = (
    kind: ProviderEvidence["kind"],
    label: string,
    value: string | null | undefined,
    providerField: string,
    phase?: ProviderEvidence["phase"]
  ) => {
    const cleanedValue = cleanText(value);
    if (!cleanedValue) {
      return;
    }

    evidence.push({
      kind,
      label,
      value: cleanedValue,
      providerField,
      phase,
      confidence: 1
    });
  };
  const pushBoardEvidence = (phase: PhaseKey, units: SourceUnit[] | undefined, providerField: string) => {
    if (!units?.length) {
      return;
    }

    pushEvidence(
      "board",
      `${phase} board`,
      units.map((unit) => sourceUnitEvidenceLabel(unit, catalogs)).join(" | "),
      providerField,
      phase
    );
  };

  pushEvidence("identity", "Provider title", comp.title, "title", "overview");
  pushEvidence("rank", "Provider rank", comp.tier, "tier", "overview");
  pushEvidence("style", "Provider style", comp.playstyle, "playstyle", "overview");

  pushBoardEvidence("early", comp.earlyUnits, "earlyUnits");
  pushBoardEvidence("mid", comp.midUnits, "midUnits");
  pushBoardEvidence("late", comp.finalUnits?.length ? comp.finalUnits : comp.units, comp.finalUnits?.length ? "finalUnits" : "units");

  for (const augment of comp.augments ?? []) {
    const value = cleanText(augment.name) || cleanText(augment.slug) || cleanText(augment.apiName);
    pushEvidence("augment", "Provider augment", value, "augments", "overview");
  }

  for (const augmentType of comp.augmentTypes ?? []) {
    pushEvidence("augment-angle", "Augment angle", augmentType, "augmentTypes", "overview");
  }

  pushEvidence("guide", "Augment note", comp.augmentsTip, "augmentsTip", "overview");

  for (const tip of comp.tips ?? []) {
    const stage = cleanText(tip.stage) || "Guide";
    const value = cleanText(tip.tip);
    pushEvidence("guide", stage, value, "tips", evidencePhaseFromText(`${stage} ${value}`));
  }

  for (const line of comp.levelingLines ?? []) {
    pushEvidence("leveling", "Leveling line", line, "levelingLines", "overview");
  }

  if (comp.mainChampionId) {
    pushEvidence(
      "identity",
      "Main champion",
      catalogs.championsById[comp.mainChampionId]?.name ?? titleCaseFromSlug(comp.mainChampionId),
      "mainChampionId",
      "overview"
    );
  }
  if (comp.mainItemId) {
    pushEvidence(
      "item",
      "Main item",
      catalogs.itemNameById[comp.mainItemId] ?? COMPONENT_LABELS[comp.mainItemId] ?? titleCaseFromSlug(comp.mainItemId),
      "mainItemId",
      "overview"
    );
  }

  pushEvidence("team-code", "Team planner code", comp.teamCode, "teamCode", "overview");
  pushEvidence("metadata", "Provider created", comp.createdAt, "createdAt", "overview");
  pushEvidence("metadata", "Provider updated", comp.updatedAt, "updatedAt", "overview");

  return evidence;
}

function buildProviderProvenance(comp: SourceComp, capturedAt: string): ProviderProvenance {
  return {
    provider: comp.source,
    url: comp.url,
    externalId: comp.externalId || undefined,
    capturedAt,
    createdAt: cleanText(comp.createdAt) || undefined,
    updatedAt: cleanText(comp.updatedAt) || undefined
  };
}

function buildGuide(comp: SourceComp, catalogs: Pick<Catalogs, "championsById" | "itemNameById">): CompGuide {
  const allTips = comp.tips ?? [];
  const mainChampion = comp.mainChampionId ? catalogs.championsById[comp.mainChampionId]?.name : null;
  const mainItem = comp.mainItemId ? catalogs.itemNameById[comp.mainItemId] : null;
  const sourceName = sourceDisplayName(comp.source);

  const overview = [
    {
      title: "General info",
      lines: compactLines([
        `${comp.title}${comp.tier ? ` is listed around ${comp.tier}-tier` : ""}${comp.playstyle ? ` as ${comp.playstyle}` : ""}.`,
        mainChampion ? `Primary unit: ${mainChampion}.` : null,
        mainItem ? `Key item or condition: ${mainItem}.` : null,
        `Source: ${sourceName}.`
      ])
    },
    {
      title: "When to make",
      lines: compactLines([
        ...(comp.augmentTypes ?? []).map((type) => `${titleCaseFromSlug(normalizeId(type))} augment angle`),
        comp.augmentsTip || null,
        comp.playstyle ? `Comfortable line: ${comp.playstyle}.` : null
      ]).slice(0, 6)
    },
    {
      title: "How to play",
      lines: compactLines([
        comp.playstyle ? `Style: ${comp.playstyle}` : null,
        ...allTips.slice(0, 2).map((tip) => `${tip.stage}: ${tip.tip}`)
      ])
    },
    buildLevelGuide(comp.playstyle, comp.levelingLines)
  ].filter((section) => section.lines.length);

  const earlyLines = sectionsByStage(allTips, /stage 2|early/i);
  const midLines = sectionsByStage(allTips, /stage 3|mid/i);
  const lateLines = sectionsByStage(allTips, /stage 4|stage 5|late|cap/i);

  return {
    overview,
    phases: {
      early: [
        {
          title: "Early Game Plan",
          lines: earlyLines.length ? earlyLines : ["Use the early board as the opener and preserve HP while building toward the listed core."]
        }
      ],
      mid: [
        {
          title: "Mid Game Plan",
          lines: midLines.length ? midLines : ["Bridge with the mid board, hold core units, and keep item holders aligned with the final carries."]
        }
      ],
      late: [
        {
          title: "Additional comp tips",
          lines: compactLines([
            ...lateLines,
            comp.augmentsTip || null,
            `Use this as the ${sourceName} published line.`
          ])
        }
      ]
    }
  };
}

function buildComponentDemand(rawLateBoard: SourceUnit[], catalogs: Pick<Catalogs, "itemRecipeById">) {
  const demand = new Map<string, number>();

  for (const rawUnit of rawLateBoard) {
    for (const itemId of rawUnit.itemIds) {
      const recipe = catalogs.itemRecipeById[itemId];
      if (!recipe) {
        continue;
      }
      for (const componentId of recipe) {
        demand.set(componentId, (demand.get(componentId) ?? 0) + 1);
      }
    }
  }

  return [...demand.entries()]
    .map(([componentId, count]) => ({
      componentId,
      label: COMPONENT_LABELS[componentId] ?? titleCaseFromSlug(componentId),
      count
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function findEmblemSynergy(itemId: string, synergiesById: Dataset["synergiesById"]) {
  if (!itemId.endsWith("-emblem")) {
    return null;
  }

  const traitId = itemId.replace(/-emblem$/, "");
  return (
    synergiesById[traitId] ??
    Object.values(synergiesById).find((synergy) => synergy.id.replace(/-/g, "") === traitId.replace(/-/g, "")) ??
    null
  );
}

function findCatalogItemForUsedId(itemId: string, catalogs: Catalogs) {
  const direct = catalogs.itemsById[itemId];
  if (direct) {
    return direct;
  }

  const compactCandidates = new Set([itemId.replace(/-/g, "")]);
  compactCandidates.add(itemId.replace(/-\d+$/g, "").replace(/\d+$/g, "").replace(/-/g, ""));

  return (
    Object.values(catalogs.itemsById).find((item) => {
      const compactItemId = item.id.replace(/-/g, "");
      return compactCandidates.has(compactItemId);
    }) ?? null
  );
}

let localItemAssetFiles: string[] | null = null;

function getLocalItemAssetFiles() {
  if (!localItemAssetFiles) {
    const itemAssetDir = path.join(PUBLIC_ASSETS_DIR, "items");
    localItemAssetFiles = fsSync.existsSync(itemAssetDir)
      ? fsSync.readdirSync(itemAssetDir).filter((fileName) => fileName.toLowerCase().endsWith(".png"))
      : [];
  }
  return localItemAssetFiles;
}

function localItemIconForId(itemId: string) {
  const compactId = itemId.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const match = getLocalItemAssetFiles().find((fileName) => {
    const compactFile = path.basename(fileName, ".png").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return compactFile === compactId;
  });

  return match ? toWebPath("assets", "items", match) : toWebPath("assets", "items", "missingno.png");
}

function withRecipeIds(itemId: string, item: Dataset["itemsById"][string], catalogs: Pick<Catalogs, "itemRecipeById">) {
  const recipeIds = catalogs.itemRecipeById[itemId] ?? catalogs.itemRecipeById[item.id] ?? item.recipeIds;
  return recipeIds ? { ...item, recipeIds } : item;
}

function getAlwaysShippedItemIds(catalogs: Pick<Catalogs, "itemsById" | "synergiesById">) {
  return Object.values(catalogs.itemsById)
    .filter((item) => /emblem$/i.test(item.name) && findEmblemSynergy(item.id, catalogs.synergiesById))
    .map((item) => item.id);
}

function buildUsedItemsById(usedItemIds: Set<string>, catalogs: Catalogs): Dataset["itemsById"] {
  const itemsById: Dataset["itemsById"] = {};
  const itemIdsToShip = new Set([...usedItemIds, ...getAlwaysShippedItemIds(catalogs)]);

  for (const itemId of itemIdsToShip) {
    const existing = findCatalogItemForUsedId(itemId, catalogs);
    if (existing) {
      itemsById[itemId] = withRecipeIds(itemId, { ...existing, id: itemId }, catalogs);
      continue;
    }

    const synergy = findEmblemSynergy(itemId, catalogs.synergiesById);
    if (synergy) {
      itemsById[itemId] = withRecipeIds(
        itemId,
        {
          id: itemId,
          name: `${synergy.name} Emblem`,
          description: `Counts as ${synergy.name}.`,
          icon: synergy.icon
        },
        catalogs
      );
      continue;
    }

    itemsById[itemId] = withRecipeIds(
      itemId,
      {
        id: itemId,
        name: COMPONENT_LABELS[itemId] ?? titleCaseFromSlug(itemId),
        description: "",
        icon: localItemIconForId(itemId)
      },
      catalogs
    );
  }

  return itemsById;
}

function buildCompFromSourceComp(comp: SourceComp, catalogs: Catalogs, capturedAt: string): Comp {
  const finalUnits = comp.finalUnits?.length ? comp.finalUnits : comp.units;
  const earlyUnits = comp.earlyUnits?.length ? comp.earlyUnits : [];
  const midUnits = comp.midUnits?.length ? comp.midUnits : [];
  const providerName = sourceDisplayName(comp.source);
  const sourceEvidence = buildProviderEvidence(comp, catalogs);
  const sourceProvenance = buildProviderProvenance(comp, capturedAt);
  const augmentIds = Array.from(
    new Set(
      (comp.augments ?? [])
        .map((augment) => sourceAugmentId(augment, catalogs))
        .filter((augmentId): augmentId is string => Boolean(augmentId && catalogs.augmentsById[augmentId]))
    )
  ).slice(0, 9);

  return {
    id: normalizeId(`${comp.source}-${comp.externalId || comp.title}`),
    title: `${comp.title} (${providerName})`,
    sourceUrl: comp.url,
    sources: [
      {
        name: comp.source,
        url: comp.url,
        externalId: comp.externalId,
        tier: comp.tier,
        confidence: 1,
        provenance: sourceProvenance,
        evidence: sourceEvidence
      }
    ],
    phases: {
      early: unitsToPhaseData(earlyUnits, catalogs),
      mid: unitsToPhaseData(midUnits, catalogs),
      late: unitsToPhaseData(finalUnits, catalogs)
    },
    recommendedAugmentIds: augmentIds,
    guide: buildGuide(comp, catalogs),
    componentDemand: buildComponentDemand(finalUnits, catalogs),
    notes: `${providerName} provider build.`,
    teamCode: buildProviderTeamPlannerCode(comp, finalUnits, catalogs)
  };
}

function buildProviderTeamPlannerCode(comp: SourceComp, finalUnits: SourceUnit[], catalogs: Catalogs) {
  const scrapedCode = cleanText(comp.teamCode);
  if (scrapedCode) {
    return scrapedCode;
  }

  const sourceUnits = comp.source === "tftacademy" ? sortTftAcademyTeamPlannerUnits(finalUnits, catalogs) : finalUnits;
  return encodeRiotTeamPlannerCode(sourceUnits, catalogs);
}

function sortTftAcademyTeamPlannerUnits(sourceUnits: SourceUnit[], catalogs: Pick<Catalogs, "championsById">) {
  return sourceUnits
    .map((unit, sourceIndex) => ({ unit, sourceIndex }))
    .sort((left, right) => {
      const leftChampion = catalogs.championsById[left.unit.championId];
      const rightChampion = catalogs.championsById[right.unit.championId];
      const costDelta = (leftChampion?.cost ?? 99) - (rightChampion?.cost ?? 99);
      if (costDelta) {
        return costDelta;
      }

      const itemDelta = left.unit.itemIds.length - right.unit.itemIds.length;
      if (itemDelta) {
        return itemDelta;
      }

      const nameDelta = (leftChampion?.name ?? left.unit.championId).localeCompare(
        rightChampion?.name ?? right.unit.championId
      );
      return nameDelta || left.sourceIndex - right.sourceIndex;
    })
    .map((entry) => entry.unit);
}

function encodeRiotTeamPlannerCode(sourceUnits: SourceUnit[], catalogs: Pick<Catalogs, "teamPlannerCodeByChampionId">) {
  const championCodes = sourceUnits
    .map((unit) => catalogs.teamPlannerCodeByChampionId[unit.championId])
    .filter((code): code is number => Number.isFinite(code) && code > 0)
    .slice(0, 10);

  if (!championCodes.length) {
    return undefined;
  }

  const chunks = Array.from({ length: 10 }, (_, index) =>
    Math.trunc(championCodes[index] ?? 0)
      .toString(16)
      .padStart(3, "0")
  );
  return `02${chunks.join("")}TFTSet${CURRENT_SET}`;
}

function dedupeCompIds(comps: Comp[]) {
  const counts = new Map<string, number>();
  return comps.map((comp) => {
    const count = counts.get(comp.id) ?? 0;
    counts.set(comp.id, count + 1);
    return count === 0 ? comp : { ...comp, id: `${comp.id}-${count + 1}` };
  });
}

export async function buildDataset() {
  await ensureDirectory(PUBLIC_DATA_DIR);
  await ensureDirectory(PUBLIC_ASSETS_DIR);
  const generatedAt = new Date().toISOString();

  const [cdragon, teamPlanner, mobalytics] = await Promise.all([
    fetchJson<CDragonTftData>(CDRAGON_TFT_URL),
    fetchJson<TeamPlannerData>(CDRAGON_TEAM_PLANNER_URL),
    loadMobalyticsLookups()
  ]);

  const catalogs = buildCatalogs(cdragon, mobalytics, teamPlanner);
  const [academyComps, tftacticsComps, tftflowComps] = await Promise.all([
    loadTftAcademySourceComps(catalogs),
    loadTftacticsSourceComps(),
    loadTftflowSourceComps(catalogs)
  ]);

  const sourceComps = [...academyComps, ...mobalytics.comps, ...tftacticsComps, ...tftflowComps].filter(
    (comp) => comp.units.length >= 3 || Boolean(comp.finalUnits?.length) || comp.source === "tftflow"
  );
  ensureReferencedAugments(sourceComps, catalogs);
  const comps = dedupeCompIds(
    sourceComps
      .map((comp) => buildCompFromSourceComp(comp, catalogs, generatedAt))
      .filter((comp) => comp.phases.late.championIds.length >= 3)
      .filter((comp) => comp.recommendedAugmentIds.length > 0)
      .sort((left, right) => {
        const leftSource = left.sources[0];
        const rightSource = right.sources[0];
        return (
          sourceTierOrder(leftSource?.tier) - sourceTierOrder(rightSource?.tier) ||
          sourceOrder(leftSource?.name as SourceName) - sourceOrder(rightSource?.name as SourceName) ||
          left.title.localeCompare(right.title)
        );
      })
  );

  const usedAugmentIds = new Set(comps.flatMap((comp) => comp.recommendedAugmentIds));
  const augmentsById = Object.fromEntries(
    Object.entries(catalogs.augmentsById).filter(([augmentId]) => usedAugmentIds.has(augmentId))
  ) as Dataset["augmentsById"];

  const usedSynergyIds = new Set(
    comps.flatMap((comp) => ["early", "mid", "late"].flatMap((phase) => comp.phases[phase as PhaseKey].synergyIds))
  );
  const synergiesById = Object.fromEntries(
    Object.entries(catalogs.synergiesById).filter(([synergyId]) => usedSynergyIds.has(synergyId))
  ) as Dataset["synergiesById"];

  const usedItemIds = new Set(
    [
      ...comps.flatMap((comp) =>
        (["early", "mid", "late"] as const).flatMap((phase) =>
          comp.phases[phase].boardSlots.flatMap((slot) => slot.itemIds)
        )
      ),
      ...Object.values(catalogs.championsById).flatMap((champion) => champion.recommendedItemIds)
    ]
  );
  const itemsById = buildUsedItemsById(usedItemIds, catalogs);

  const dataset = datasetSchema.parse({
    meta: {
      schemaVersion: "1",
      set: CURRENT_SET,
      generatedAt,
      source: {
        comps: "provider-separated tftacademy + mobalytics + tftactics + tftflow with zero-augment builds rejected",
        champions: "communitydragon-latest-cdragon-tft",
        augmentRanks: "mobalytics-stats-tier + communitydragon-augment-catalog"
      }
    },
    comps,
    championsById: catalogs.championsById,
    augmentsById,
    synergiesById,
    itemsById
  });

  const referencedAssetPaths = new Set([
    ...Object.values(dataset.championsById).map((entry) => entry.icon),
    ...Object.values(dataset.augmentsById).map((entry) => entry.icon),
    ...Object.values(dataset.synergiesById).map((entry) => entry.icon),
    ...Object.values(dataset.itemsById).map((entry) => entry.icon)
  ]);
  await downloadAssets(catalogs.assetDownloads.filter((download) => referencedAssetPaths.has(download.webPath)));
  return dataset;
}

export function validateDataset(dataset: Dataset) {
  const problems: string[] = [];
  const checkedDataset = datasetSchema.parse(dataset);

  for (const comp of checkedDataset.comps) {
    if (comp.sources.length !== 1) {
      problems.push(`${comp.title} must have exactly one provider source; merged provider builds are not allowed.`);
    }

    const source = comp.sources[0];
    const providerBoardPhases = new Set<PhaseKey>();
    if (source) {
      if (!source.provenance) {
        problems.push(`${comp.title} is missing provider provenance.`);
      } else {
        if (source.provenance.provider !== source.name) {
          problems.push(`${comp.title} provider provenance does not match source ${source.name}.`);
        }
        if (source.provenance.url !== source.url) {
          problems.push(`${comp.title} provider provenance URL does not match source URL.`);
        }
      }

      if (!source.evidence.length) {
        problems.push(`${comp.title} is missing provider-native evidence.`);
      } else {
        const evidenceKinds = new Set(source.evidence.map((entry) => entry.kind));
        if (!evidenceKinds.has("board")) {
          problems.push(`${comp.title} provider-native evidence is missing board data.`);
        }
        if (!evidenceKinds.has("augment")) {
          problems.push(`${comp.title} provider-native evidence is missing augment data.`);
        }

        for (const entry of source.evidence) {
          if (entry.kind === "board" && PHASES.includes(entry.phase as PhaseKey)) {
            providerBoardPhases.add(entry.phase as PhaseKey);
          }
        }
      }
    }

    for (const phaseKey of PHASES) {
      const phase = comp.phases[phaseKey];
      if (phaseHasBoardData(phase) && providerBoardPhases.size > 0 && !providerBoardPhases.has(phaseKey)) {
        problems.push(`${comp.title} ${phaseKey} phase has board data without provider board evidence.`);
      }
      if (phase.boardSlots.length !== 28) {
        problems.push(`${comp.title} ${phaseKey} phase does not contain 28 board slots.`);
      }
      for (const championId of phase.championIds) {
        if (!checkedDataset.championsById[championId]) {
          problems.push(`${comp.title} references missing champion ${championId}.`);
        }
      }
      for (const synergyId of phase.synergyIds) {
        if (!checkedDataset.synergiesById[synergyId]) {
          problems.push(`${comp.title} references missing synergy ${synergyId}.`);
        }
      }
      for (const slot of phase.boardSlots) {
        for (const itemId of slot.itemIds) {
          if (!checkedDataset.itemsById[itemId]) {
            problems.push(`${comp.title} ${phaseKey} board references missing item ${itemId}.`);
          }
        }
      }
    }

    if (!comp.guide.overview.length) {
      problems.push(`${comp.title} is missing overview guide content.`);
    }

    if (!comp.recommendedAugmentIds.length) {
      problems.push(`${comp.title} has no recommended augments.`);
    }

    const teamPlannerPattern = new RegExp(`^02(?:[0-9a-f]{3}){10}TFTSet${checkedDataset.meta.set}$`, "i");
    if (!comp.teamCode) {
      problems.push(`${comp.title} is missing a team planner copy code.`);
    } else if (!teamPlannerPattern.test(comp.teamCode)) {
      problems.push(`${comp.title} has an invalid team planner copy code.`);
    }

    for (const augmentId of comp.recommendedAugmentIds) {
      if (!checkedDataset.augmentsById[augmentId]) {
        problems.push(`${comp.title} references missing augment ${augmentId}.`);
      }
    }
  }

  const assetGroups = [
    ...Object.values(checkedDataset.championsById),
    ...Object.values(checkedDataset.augmentsById),
    ...Object.values(checkedDataset.synergiesById),
    ...Object.values(checkedDataset.itemsById)
  ];

  for (const champion of Object.values(checkedDataset.championsById)) {
    for (const itemId of champion.recommendedItemIds) {
      if (!checkedDataset.itemsById[itemId]) {
        problems.push(`${champion.name} recommends missing item ${itemId}.`);
      }
    }
  }

  for (const asset of assetGroups) {
    if (asset.icon.startsWith("http")) {
      problems.push(`Remote asset URL found in runtime dataset: ${asset.icon}`);
    }
    if (asset.icon.endsWith("/missingno.png") || asset.icon === "assets/items/missingno.png") {
      problems.push(`${asset.id} still uses the missing item placeholder icon.`);
    }
  }

  const totalCompAugments = checkedDataset.comps.reduce((sum, comp) => sum + comp.recommendedAugmentIds.length, 0);
  const unknownAugments = checkedDataset.comps.reduce((sum, comp) => {
    return (
      sum +
      comp.recommendedAugmentIds.filter((augmentId) => checkedDataset.augmentsById[augmentId]?.tier === "Unknown").length
    );
  }, 0);
  const unknownRate = totalCompAugments === 0 ? 0 : unknownAugments / totalCompAugments;
  if (unknownRate > 0.05) {
    problems.push(`Unknown augment rank rate ${Math.round(unknownRate * 1000) / 10}% exceeds the 5% threshold.`);
  }

  return problems;
}

export async function writeDataset(dataset: Dataset) {
  await ensureDirectory(PUBLIC_DATA_DIR);
  const outPath = path.join(PUBLIC_DATA_DIR, DATASET_FILE);
  await fs.writeFile(outPath, JSON.stringify(dataset, null, 2));
  return outPath;
}
