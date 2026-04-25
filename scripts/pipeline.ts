import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  AUGMENT_RANKS,
  COMPONENT_LABELS,
  COMPONENT_RECIPES,
  normalizeAugmentLookup,
  normalizeChampionLookup,
  normalizeId,
  normalizeTierRank,
  titleCaseFromSlug
} from "../shared/normalization";
import {
  datasetSchema,
  type BoardSlot,
  type Comp,
  type CompGuide,
  type Dataset,
  type GuideSection,
  type PhaseData
} from "../shared/tft";

type SourceName = "tftacademy" | "mobalytics" | "tftactics" | "tftflow" | "metatft";
type PhaseKey = "early" | "mid" | "late";

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
  finalUnits?: SourceUnit[];
  augments?: SourceAugment[];
  augmentTypes?: string[];
  tips?: Array<{ stage: string; tip: string }>;
  augmentsTip?: string;
  mainChampionId?: string;
  mainItemId?: string;
  teamCode?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SourceRef = {
  name: SourceName;
  url: string;
  externalId?: string;
  tier?: string;
  confidence?: number;
};

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

type Catalogs = {
  championsById: Dataset["championsById"];
  synergiesById: Dataset["synergiesById"];
  augmentsById: Dataset["augmentsById"];
  itemsById: Dataset["itemsById"];
  championRoles: Record<string, string>;
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
  augmentRankByApi: Record<string, string>;
  augmentRankBySlug: Record<string, string>;
  augmentNameByApi: Record<string, string>;
  augmentDescriptionByApi: Record<string, string>;
  championUnlocksById: Record<string, { requiresUnlock: boolean; unlockCondition: string | null }>;
};

const CURRENT_SET = 17;
const DATASET_FILE = `tft-set${CURRENT_SET}.json`;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, "src", "data");
const RAW_DIR = path.join(ROOT_DIR, "data", "raw");
const CDRAGON_TFT_URL = "https://raw.communitydragon.org/latest/cdragon/tft/en_us.json";
const CDRAGON_GAME_BASE_URL = "https://raw.communitydragon.org/latest/game/";
const MOBALYTICS_COMPS_URL = `https://mobalytics.gg/tft/set${CURRENT_SET}/team-comps`;
const TFTACADEMY_COMPS_URL = "https://tftacademy.com/tierlist/comps";
const TFTACTICS_COMPS_URL = "https://tftactics.gg/tierlist/team-comps";
const TFTFLOW_COMPS_URL = "https://tftflow.com/";
const METATFT_CLUSTER_URL = "https://api-hc.metatft.com/tft-comps-api/latest_cluster_info";
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
  TFT_Item_SparringGloves: "sparring-gloves"
};

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
      .replace(/^TFT\d*_?/i, "")
      .replace(/^TFTSet\d*_?/i, "")
      .replace(/^Item_?/i, "")
      .replace(/^Augment_?/i, "")
  );
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
  boardIndex?: number
): SourceUnit | null {
  if (!championId) {
    return null;
  }
  return { championId, itemIds, boardIndex };
}

function buildCatalogs(cdragon: CDragonTftData, mobalytics: MobalyticsLookups): Catalogs {
  const assetDownloads: AssetDownload[] = [];
  const setData =
    cdragon.setData?.find((set) => set.number === CURRENT_SET || set.mutator === `TFTSet${CURRENT_SET}`) ?? {};

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
    if (!item.apiName || !item.name) {
      continue;
    }
    const itemId = normalizeId(item.name);
    itemIdByApiName[item.apiName] = itemId;
    itemNameById[itemId] = item.name;
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
      stats: {
        hp: champion.stats?.hp ?? null,
        mana: champion.stats?.mana ?? null,
        initialMana: champion.stats?.initialMana ?? null,
        damage: champion.stats?.damage ?? null,
        range: champion.stats?.range ?? null
      },
      icon: queueAsset(assetDownloads, cdragonAssetUrl(champion.tileIcon ?? champion.squareIcon ?? champion.icon), "champions", id)
    };
  }

  const synergiesById: Dataset["synergiesById"] = {};
  for (const trait of cdragon.sets?.[String(CURRENT_SET)]?.traits ?? []) {
    if (!trait.name) {
      continue;
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
    if (!item.apiName || !item.name || !item.icon) {
      continue;
    }
    if (augmentApiNamesSet.has(item.apiName)) {
      continue;
    }
    if (!item.apiName.startsWith("TFT_Item_") && !componentApiNamesSet.has(item.apiName)) {
      continue;
    }
    const id = itemIdByApiName[item.apiName] ?? normalizeId(item.name);
    if (!id || itemsById[id]) {
      continue;
    }
    itemsById[id] = {
      id,
      name: item.name,
      description: cleanGameText(item.desc),
      icon: queueAsset(assetDownloads, cdragonAssetUrl(item.icon), "items", id)
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
  return catalogs.itemIdByApiName[value] ?? normalizeId(value);
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

function normalizeSourceUnits(
  units: Array<{ apiName?: string; boardIndex?: number; items?: string[]; name?: string }> | undefined,
  catalogs: Pick<Catalogs, "itemIdByApiName">
) {
  return (units ?? [])
    .map((unit) =>
      buildSourceUnitFromChampionId(
        unit.apiName ? idFromApiName(unit.apiName) : championIdFromName(unit.name),
        (unit.items ?? []).map((item) => itemIdFromSource(item, catalogs)).filter(Boolean),
        typeof unit.boardIndex === "number" ? unit.boardIndex : undefined
      )
    )
    .filter((unit): unit is SourceUnit => Boolean(unit));
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
  for (const [key, raw] of Object.entries(stat)) {
    if (!key.startsWith("ChampionsV1DataFlatDto")) {
      continue;
    }
    const champion = raw as any;
    if (champion.gameSet !== `set${CURRENT_SET}`) {
      continue;
    }
    const id = championIdFromName(champion.slug ?? champion.name);
    championUnlocksById[id] = {
      requiresUnlock: Boolean(champion.isUnlockable || champion.unlockCondition),
      unlockCondition: cleanText(champion.unlockCondition) || null
    };
  }

  const comps = Object.entries(dynamic)
    .filter(([key]) => key.startsWith("TftComposition:"))
    .map(([key, raw]) => {
      const comp = derefApollo(allCache, raw);
      const guide = derefApollo(allCache, comp.guide);
      const finalUnits = (comp.formation?.positions ?? [])
        .map((position: any) => {
          const champion = position.champion?.champion;
          const championId = championIdFromName(champion?.slug);
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
            boardIndex: Number.isFinite(Number(position.coordinates))
              ? Number(position.coordinates)
              : undefined,
            itemIds: (position.champion?.items ?? []).map((item: any) => normalizeId(item.slug)).filter(Boolean),
            starLevel
          } satisfies SourceUnit;
        })
        .filter((unit: SourceUnit | null): unit is SourceUnit => Boolean(unit));

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
        finalUnits,
        augments,
        tips: comp.description ? [{ stage: "Overview", tip: comp.description }] : [],
        createdAt: comp.createdAt,
        updatedAt: comp.updatedAt
      } satisfies SourceComp;
    });

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
  return guides.map((guide) => {
    const title = cleanText(guide.metaTitle || guide.title || guide.compSlug);
    const finalUnits = normalizeSourceUnits(guide.finalComp, catalogs);
    const earlyUnits = normalizeSourceUnits(guide.earlyComp, catalogs);
    const augments = [...(guide.augments ?? []), ...(guide.overlayAugments ?? [])]
      .map((augment: any) => ({ apiName: cleanText(augment.apiName) }))
      .filter((augment: SourceAugment) => Boolean(augment.apiName));

    return {
      source: "tftacademy" as const,
      externalId: cleanText(guide.id || guide.compSlug || title),
      title,
      url: `https://tftacademy.com/tierlist/comps/${guide.compSlug}`,
      tier: cleanText(guide.tier),
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
  });
}

async function loadTftacticsSourceComps() {
  const html = await fetchText(TFTACTICS_COMPS_URL);
  const document = parseHtmlDocument(html);

  return [...document.querySelectorAll(".team-portrait")]
    .map((card, index) => {
      const title = cleanText(card.querySelector(".team-name-elipsis")?.childNodes.item(0)?.textContent);
      const tier = cleanText(card.querySelector(".team-rank")?.textContent);
      const playstyle = cleanText(card.querySelector(".team-playstyle")?.textContent);
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

  const href =
    image.getAttribute("href") ??
    image.getAttribute("xlink:href") ??
    image.getAttribute("src") ??
    "";
  const fileName = href.split("/").pop() ?? "";
  const apiName = fileName
    .replace(/\?.*$/, "")
    .replace(/\.(?:tft_set\d+\.)?png$/i, "")
    .replace(/_square.*$/i, "");
  return idFromApiName(apiName);
}

async function loadTftflowDetailComp(link: HTMLAnchorElement, index: number): Promise<SourceComp> {
  const title = cleanText(link.textContent);
  const url = link.href || TFTFLOW_COMPS_URL;
  const fallbackWrapper = link.closest(".comp-card-wrapper") ?? link.parentElement;
  const fallbackUnits = [...(fallbackWrapper?.querySelectorAll("img") ?? [])]
    .map((image) => buildSourceUnitFromChampionId(championIdFromTftflowImage(image)))
    .filter((unit): unit is SourceUnit => Boolean(unit));

  try {
    const detailDocument = parseHtmlDocument(await fetchText(url));
    const detailTitle = cleanText(detailDocument.querySelector(".comp-title")?.textContent) || title;
    const tier = cleanText(detailDocument.querySelector(".comp-tier")?.textContent).replace(/Tier$/i, "");
    const playstyle = cleanText(detailDocument.querySelector(".comp-econ-strategy-label")?.textContent);
    const board = detailDocument.querySelector(".boards-flex-container");
    const units = [...(board?.querySelectorAll("image[href*='/champions/'], image[xlink\\:href*='/champions/']") ?? [])]
      .map((image) => buildSourceUnitFromChampionId(championIdFromTftflowImage(image)))
      .filter((unit): unit is SourceUnit => Boolean(unit));

    return {
      source: "tftflow" as const,
      externalId: `tftflow-${index}-${normalizeId(detailTitle)}`,
      title: detailTitle,
      url,
      tier: cleanText(tier).toUpperCase(),
      playstyle,
      units: uniqueUnits(units.length ? units : fallbackUnits),
      finalUnits: uniqueUnits(units.length ? units : fallbackUnits)
    } satisfies SourceComp;
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

async function loadTftflowSourceComps() {
  const html = await fetchText(TFTFLOW_COMPS_URL);
  const document = parseHtmlDocument(html);

  const links = [...document.querySelectorAll<HTMLAnchorElement>(".meta-tier-comp-link")].filter((link) =>
    Boolean(cleanText(link.textContent))
  );
  const comps = await Promise.all(links.map((link, index) => loadTftflowDetailComp(link, index)));
  return comps.filter((comp) => comp.title);
}

async function loadMetaTftSourceComps() {
  const data = await fetchJson<any>(METATFT_CLUSTER_URL);
  const clusters = data.cluster_info?.cluster_details?.clusters ?? [];

  return clusters.map((cluster: any) => {
    const units = cleanText(cluster.units_string)
      .split(",")
      .map((entry) => buildSourceUnitFromChampionId(idFromApiName(entry.trim())))
      .filter((unit): unit is SourceUnit => Boolean(unit));
    const nameParts = cleanText(cluster.name_string)
      .split(",")
      .map((entry) => titleFromApiName(entry.trim()))
      .filter(Boolean);
    const title = nameParts.length ? nameParts.join(" ") : `MetaTFT Cluster ${cluster.Cluster}`;

    return {
      source: "metatft" as const,
      externalId: String(cluster.Cluster),
      title,
      url: "https://www.metatft.com/comps",
      units,
      finalUnits: units
    } satisfies SourceComp;
  });
}

function unitSet(comp: SourceComp) {
  return new Set((comp.finalUnits?.length ? comp.finalUnits : comp.units).map((unit) => unit.championId));
}

function tokenSet(value: string) {
  return new Set(normalizeId(value).split("-").filter((token) => token.length > 2));
}

function overlapScore(left: SourceComp, right: SourceComp) {
  const leftUnits = unitSet(left);
  const rightUnits = unitSet(right);
  const intersection = [...leftUnits].filter((unitId) => rightUnits.has(unitId)).length;
  const union = new Set([...leftUnits, ...rightUnits]).size || 1;
  const unitScore = intersection / union;

  const leftTokens = tokenSet(left.title);
  const rightTokens = tokenSet(right.title);
  const tokenIntersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const tokenUnion = new Set([...leftTokens, ...rightTokens]).size || 1;
  const titleScore = tokenIntersection / tokenUnion;

  if (leftUnits.size === 0 || rightUnits.size === 0) {
    return titleScore;
  }

  return unitScore * 0.75 + titleScore * 0.25;
}

function mergeSourceComps(primarySources: SourceComp[], supportingSources: SourceComp[]) {
  const canonical: Array<{ base: SourceComp; sources: SourceRef[]; contributors: SourceComp[] }> = [];

  for (const comp of primarySources) {
    const best = canonical
      .map((entry) => ({ entry, score: overlapScore(entry.base, comp) }))
      .sort((left, right) => right.score - left.score)[0];

    if (best && best.score >= 0.62) {
      best.entry.sources.push({
        name: comp.source,
        url: comp.url,
        externalId: comp.externalId,
        tier: comp.tier,
        confidence: Number(best.score.toFixed(3))
      });
      best.entry.contributors.push(comp);
    } else {
      canonical.push({
        base: comp,
        sources: [
          {
            name: comp.source,
            url: comp.url,
            externalId: comp.externalId,
            tier: comp.tier,
            confidence: 1
          }
        ],
        contributors: [comp]
      });
    }
  }

  for (const comp of supportingSources) {
    const best = canonical
      .map((entry) => ({ entry, score: overlapScore(entry.base, comp) }))
      .sort((left, right) => right.score - left.score)[0];
    if (best && best.score >= 0.42) {
      best.entry.sources.push({
        name: comp.source,
        url: comp.url,
        externalId: comp.externalId,
        tier: comp.tier,
        confidence: Number(best.score.toFixed(3))
      });
      best.entry.contributors.push(comp);
    }
  }

  return canonical;
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

function fallbackEarlyUnits(finalUnits: SourceUnit[], catalogs: Pick<Catalogs, "championsById">) {
  return uniqueUnits(finalUnits)
    .sort((left, right) => {
      const leftCost = catalogs.championsById[left.championId]?.cost ?? 9;
      const rightCost = catalogs.championsById[right.championId]?.cost ?? 9;
      return leftCost - rightCost;
    })
    .slice(0, 4)
    .map((unit) => ({ championId: unit.championId, itemIds: unit.itemIds.slice(0, 1) }));
}

function fallbackMidUnits(earlyUnits: SourceUnit[], finalUnits: SourceUnit[], catalogs: Pick<Catalogs, "championsById">) {
  const result = [...earlyUnits];
  const seen = new Set(result.map((unit) => unit.championId));
  const targetCount = 6;
  for (const unit of uniqueUnits(finalUnits).sort((left, right) => {
    const leftCost = catalogs.championsById[left.championId]?.cost ?? 9;
    const rightCost = catalogs.championsById[right.championId]?.cost ?? 9;
    return leftCost - rightCost;
  })) {
    if (seen.has(unit.championId)) {
      continue;
    }
    result.push({ championId: unit.championId, itemIds: unit.itemIds.slice(0, 2), boardIndex: unit.boardIndex });
    seen.add(unit.championId);
    if (result.length >= targetCount) {
      break;
    }
  }
  return result;
}

function unitsToPhaseData(
  sourceUnits: SourceUnit[],
  catalogs: Pick<Catalogs, "championsById" | "synergiesById" | "championRoles">
): PhaseData {
  const boardSlots: BoardSlot[] = Array.from({ length: 28 }, (_, index) => ({
    index,
    championId: null,
    locked: false,
    itemIds: []
  }));

  const championLevels: Record<string, number> = {};
  for (const unit of inferBoardIndexes(uniqueUnits(sourceUnits), catalogs)) {
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
      itemIds: unit.itemIds
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

function buildLevelGuide(playstyle: string | undefined): GuideSection {
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

function buildGuide(comp: SourceComp, contributors: SourceComp[], catalogs: Pick<Catalogs, "championsById" | "itemNameById">): CompGuide {
  const allTips = contributors.flatMap((source) => source.tips ?? []);
  const mainChampion = comp.mainChampionId ? catalogs.championsById[comp.mainChampionId]?.name : null;
  const mainItem = comp.mainItemId ? catalogs.itemNameById[comp.mainItemId] : null;
  const sourceNames = Array.from(new Set(contributors.map((source) => source.source))).join(", ");

  const overview = [
    {
      title: "General info",
      lines: compactLines([
        `${comp.title}${comp.tier ? ` is listed around ${comp.tier}-tier` : ""}${comp.playstyle ? ` as ${comp.playstyle}` : ""}.`,
        mainChampion ? `Primary unit: ${mainChampion}.` : null,
        mainItem ? `Key item or condition: ${mainItem}.` : null,
        `Sources merged: ${sourceNames}.`
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
    buildLevelGuide(comp.playstyle)
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
            "Use source overlap as confidence: comps with more sources are less likely to be single-site noise."
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

function dedupeSourceRefs(sources: SourceRef[]) {
  const bestBySource = new Map<SourceName, SourceRef>();
  for (const source of sources) {
    const current = bestBySource.get(source.name);
    if (!current || (source.confidence ?? 0) > (current.confidence ?? 0)) {
      bestBySource.set(source.name, source);
    }
  }
  return [...bestBySource.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function buildCompFromMergedEntry(
  entry: ReturnType<typeof mergeSourceComps>[number],
  catalogs: Catalogs
): Comp {
  const base = entry.base;
  const sourceRefs = dedupeSourceRefs(entry.sources);
  const contributorsByPriority = [base, ...entry.contributors.filter((source) => source !== base)];
  const finalUnits =
    contributorsByPriority.find((source) => source.finalUnits?.length)?.finalUnits ??
    contributorsByPriority.find((source) => source.units.length)?.units ??
    [];
  const earlyUnits =
    contributorsByPriority.find((source) => source.earlyUnits?.length)?.earlyUnits ??
    fallbackEarlyUnits(finalUnits, catalogs);
  const midUnits = fallbackMidUnits(earlyUnits, finalUnits, catalogs);

  const augmentIds = Array.from(
    new Set(
      contributorsByPriority
        .flatMap((source) => source.augments ?? [])
        .map((augment) => sourceAugmentId(augment, catalogs))
        .filter(Boolean)
    )
  ).slice(0, 9);

  const idBase = normalizeId(base.title) || normalizeId(base.externalId);
  const teamCode = contributorsByPriority.find((source) => source.teamCode)?.teamCode;
  return {
    id: idBase,
    title: base.title,
    sourceUrl: base.url,
    sources: sourceRefs,
    phases: {
      early: unitsToPhaseData(earlyUnits, catalogs),
      mid: unitsToPhaseData(midUnits, catalogs),
      late: unitsToPhaseData(finalUnits, catalogs)
    },
    recommendedAugmentIds: augmentIds,
    guide: buildGuide(base, contributorsByPriority, catalogs),
    componentDemand: buildComponentDemand(finalUnits, catalogs),
    notes: `Merged from ${sourceRefs.length} source${sourceRefs.length === 1 ? "" : "s"}.`,
    teamCode
  };
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

  const [cdragon, mobalytics] = await Promise.all([
    fetchJson<CDragonTftData>(CDRAGON_TFT_URL),
    loadMobalyticsLookups()
  ]);

  const catalogs = buildCatalogs(cdragon, mobalytics);
  const [academyComps, tftacticsComps, tftflowComps, metatftComps] = await Promise.all([
    loadTftAcademySourceComps(catalogs),
    loadTftacticsSourceComps(),
    loadTftflowSourceComps(),
    loadMetaTftSourceComps()
  ]);

  const merged = mergeSourceComps(
    [...academyComps, ...mobalytics.comps].filter((comp) => comp.units.length >= 3),
    [...tftacticsComps, ...tftflowComps, ...metatftComps].filter(
      (comp) => comp.units.length >= 3 || comp.source === "tftflow"
    )
  );
  const comps = dedupeCompIds(
    merged
      .map((entry) => buildCompFromMergedEntry(entry, catalogs))
      .filter((comp) => comp.phases.late.championIds.length >= 3)
      .sort((left, right) => right.sources.length - left.sources.length || left.title.localeCompare(right.title))
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
    comps.flatMap((comp) =>
      (["early", "mid", "late"] as const).flatMap((phase) =>
        comp.phases[phase].boardSlots.flatMap((slot) => slot.itemIds)
      )
    )
  );
  const itemsById = Object.fromEntries(
    Object.entries(catalogs.itemsById).filter(([itemId]) => usedItemIds.has(itemId))
  ) as Dataset["itemsById"];

  const dataset = datasetSchema.parse({
    meta: {
      schemaVersion: "1",
      set: CURRENT_SET,
      generatedAt: new Date().toISOString(),
      source: {
        comps: "tftacademy + mobalytics + tftactics + tftflow + metatft",
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

  await downloadAssets(catalogs.assetDownloads);
  return dataset;
}

export function validateDataset(dataset: Dataset) {
  const problems: string[] = [];
  const checkedDataset = datasetSchema.parse(dataset);

  for (const comp of checkedDataset.comps) {
    for (const phaseKey of ["early", "mid", "late"] as const) {
      const phase = comp.phases[phaseKey];
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
    }

    if (!comp.guide.overview.length) {
      problems.push(`${comp.title} is missing overview guide content.`);
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
    ...Object.values(checkedDataset.synergiesById)
  ];

  for (const asset of assetGroups) {
    if (asset.icon.startsWith("http")) {
      problems.push(`Remote asset URL found in runtime dataset: ${asset.icon}`);
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
