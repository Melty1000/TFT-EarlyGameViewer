export const PHASES = ["early", "mid", "late"] as const;
export type PhaseKey = (typeof PHASES)[number];

export const AUGMENT_RANKS = ["S", "A", "B", "C", "D", "Unknown"] as const;
export type AugmentRank = (typeof AUGMENT_RANKS)[number];

export const COMPONENT_RECIPES: Record<string, [string, string]> = {
  deathblade: ["bf-sword", "bf-sword"],
  "giant-slayer": ["bf-sword", "recurve-bow"],
  "hextech-gunblade": ["bf-sword", "needlessly-large-rod"],
  "spear-of-shojin": ["bf-sword", "tear-of-the-goddess"],
  spearofshojin2: ["bf-sword", "tear-of-the-goddess"],
  "edge-of-night": ["bf-sword", "chain-vest"],
  bloodthirster: ["bf-sword", "negatron-cloak"],
  "steraks-gage": ["bf-sword", "giants-belt"],
  "infinity-edge": ["bf-sword", "sparring-gloves"],
  "rapid-firecannon": ["recurve-bow", "recurve-bow"],
  "red-buff": ["recurve-bow", "recurve-bow"],
  "guinsoos-rageblade": ["recurve-bow", "needlessly-large-rod"],
  "guinsoo-s-rageblade": ["recurve-bow", "needlessly-large-rod"],
  "statikk-shiv": ["recurve-bow", "tear-of-the-goddess"],
  "void-staff": ["recurve-bow", "tear-of-the-goddess"],
  "titans-resolve": ["recurve-bow", "chain-vest"],
  "titan-s-resolve": ["recurve-bow", "chain-vest"],
  "runaans-hurricane": ["recurve-bow", "negatron-cloak"],
  "kraken-s-fury": ["recurve-bow", "negatron-cloak"],
  "nashors-tooth": ["recurve-bow", "giants-belt"],
  "nashor-s-tooth": ["recurve-bow", "giants-belt"],
  "last-whisper": ["recurve-bow", "sparring-gloves"],
  "rabadons-deathcap": ["needlessly-large-rod", "needlessly-large-rod"],
  "rabadon-s-deathcap": ["needlessly-large-rod", "needlessly-large-rod"],
  "archangels-staff": ["needlessly-large-rod", "tear-of-the-goddess"],
  "archangel-s-staff": ["needlessly-large-rod", "tear-of-the-goddess"],
  voidstaff: ["tear-of-the-goddess", "tear-of-the-goddess"],
  crownguard: ["needlessly-large-rod", "chain-vest"],
  "ionic-spark": ["needlessly-large-rod", "negatron-cloak"],
  morellonomicon: ["needlessly-large-rod", "giants-belt"],
  "jeweled-gauntlet": ["needlessly-large-rod", "sparring-gloves"],
  "blue-buff": ["tear-of-the-goddess", "tear-of-the-goddess"],
  "protectors-vow": ["tear-of-the-goddess", "chain-vest"],
  "protector-s-vow": ["tear-of-the-goddess", "chain-vest"],
  "adaptive-helm": ["tear-of-the-goddess", "negatron-cloak"],
  redemption: ["tear-of-the-goddess", "giants-belt"],
  "spirit-visage": ["tear-of-the-goddess", "giants-belt"],
  spiritvisage: ["giants-belt", "recurve-bow"],
  "hand-of-justice": ["tear-of-the-goddess", "sparring-gloves"],
  "bramble-vest": ["chain-vest", "chain-vest"],
  "gargoyle-stoneplate": ["chain-vest", "negatron-cloak"],
  "sunfire-cape": ["chain-vest", "giants-belt"],
  "steadfast-heart": ["chain-vest", "sparring-gloves"],
  "steadfast-hammer": ["chain-vest", "sparring-gloves"],
  "dragons-claw": ["negatron-cloak", "negatron-cloak"],
  "dragon-s-claw": ["negatron-cloak", "negatron-cloak"],
  evenshroud: ["negatron-cloak", "giants-belt"],
  quicksilver: ["negatron-cloak", "sparring-gloves"],
  "warmogs-armor": ["giants-belt", "giants-belt"],
  "warmog-s-armor": ["giants-belt", "giants-belt"],
  guardbreaker: ["giants-belt", "sparring-gloves"],
  "striker-s-flail": ["giants-belt", "sparring-gloves"],
  "thiefs-gloves": ["sparring-gloves", "sparring-gloves"],
  "thief-s-gloves": ["sparring-gloves", "sparring-gloves"]
};

export const COMPONENT_LABELS: Record<string, string> = {
  "bf-sword": "Sword",
  "recurve-bow": "Bow",
  "needlessly-large-rod": "Rod",
  "tear-of-the-goddess": "Tear",
  "chain-vest": "Vest",
  "negatron-cloak": "Cloak",
  "giants-belt": "Belt",
  "sparring-gloves": "Glove",
  spatula: "Spatula",
  "frying-pan": "Pan"
};

export const CHAMPION_NAME_ALIASES: Record<string, string> = {
  "azir-soldier": "Azir",
  drmundo: "Dr. Mundo",
  "frozen-tower": "Frozen Tower",
  kobukoyuumi: "Kobuko & Yuumi",
  luciansenna: "Lucian & Senna"
};

export const CHAMPION_ICON_SLUG_ALIASES: Record<string, string> = {
  "dr-mundo": "drmundo",
  "kobuko-and-yuumi": "kobukoyuumi",
  "lucian-and-senna": "luciansenna"
};

export const AUGMENT_NAME_ALIASES: Record<string, string> = {
  bestfriends1: "Best Friends I",
  bestfriends2: "Best Friends II",
  bandofthieves1: "Band of Thieves I",
  beltoverflow3: "Belt Overflow III",
  bladeoverflow3: "Blade Overflow III",
  bronzeforlife2: "Bronze For Life II",
  bronzeforlife3: "Bronze For Life III",
  buriedtreasures3: "Buried Treasures III",
  calculatedloss2: "Calculated Loss II",
  carepackage2: "Care Package II",
  celestialblessing2: "Celestial Blessing II",
  celestialblessing3: "Celestial Blessing III",
  doubletrouble2: "Double Trouble II",
  exiles1: "Exiles I",
  exiles2: "Exiles II",
  eyeforaneye1: "Eye For An Eye I",
  firesale1: "Fire Sale I",
  foodfighttactics2: "Food Fight Tactics II",
  forwardthinking2: "Forward Thinking II",
  giantandmighty3: "Giant And Mighty III",
  itemgrabbag1: "Item Grab Bag I",
  jeweledlotus2: "Jeweled Lotus II",
  jeweledlotus3: "Jeweled Lotus III",
  latentforge1: "Latent Forge I",
  lategamespecialist1: "Lategame Specialist I",
  levelup: "Level Up",
  livingforge3: "Living Forge III",
  luckygloves3: "Lucky Gloves III",
  pandorasbench2: "Pandora's Bench II",
  pandorasitems2: "Pandora's Items II",
  patientstudy2: "Patient Study II",
  placebo1: "Placebo I",
  portableforge2: "Portable Forge II",
  radiantrelic3: "Radiant Relics III",
  spiritlink2: "Spirit Link II",
  tacticianskitchen3: "Tactician's Kitchen III",
  titanictitan1: "Titanic Titan I",
  tradesector2: "Trade Sector II",
  treasurehunt2: "Treasure Hunt II",
  twomuchvalue2: "Two Much Value II",
  wandoverflow3: "Wand Overflow III"
};

export function normalizeId(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeChampionLookup(value: string | null | undefined): string {
  const normalized = normalizeId(value);
  return CHAMPION_NAME_ALIASES[normalized] ? normalizeId(CHAMPION_NAME_ALIASES[normalized]) : normalized;
}

export function normalizeTierRank(value: string | null | undefined): AugmentRank {
  const rank = (value ?? "").trim().toUpperCase();
  if (rank === "S" || rank === "A" || rank === "B" || rank === "C" || rank === "D") {
    return rank;
  }
  return "Unknown";
}

export function normalizeAugmentLookup(value: string | null | undefined): string {
  let normalized = normalizeId(value).replace(/-/g, "");
  if (normalized.endsWith("iii")) normalized = `${normalized.slice(0, -3)}3`;
  else if (normalized.endsWith("ii")) normalized = `${normalized.slice(0, -2)}2`;
  else if (normalized.endsWith("i")) normalized = `${normalized.slice(0, -1)}1`;
  return normalized;
}

export function formatAugmentName(value: string): string {
  const alias = AUGMENT_NAME_ALIASES[normalizeAugmentLookup(value)];
  if (alias) {
    return alias;
  }

  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\D)(1|2|3)$/, (_, prefix: string, rank: string) => {
      const roman = rank === "1" ? " I" : rank === "2" ? " II" : " III";
      return `${prefix}${roman}`;
    })
    .replace(/\b(i|ii|iii)\b/gi, (match) => match.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCaseFromSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
