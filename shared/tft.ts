import { z } from "zod";
import { AUGMENT_RANKS } from "./normalization";

export const componentDemandSchema = z.object({
  componentId: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().nonnegative()
});

export const boardSlotSchema = z.object({
  index: z.number().int().min(0).max(27),
  championId: z.string().nullable(),
  locked: z.boolean(),
  itemIds: z.array(z.string().min(1)),
  starLevel: z.number().int().min(1).max(3).default(1)
});

export const phaseSchema = z.object({
  boardSlots: z.array(boardSlotSchema).length(28),
  championIds: z.array(z.string().min(1)),
  synergyIds: z.array(z.string().min(1)),
  championLevels: z.record(z.number().int().min(1).max(3)).default({})
});

export const championSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().int().nonnegative(),
  traitIds: z.array(z.string().min(1)),
  abilityName: z.string().min(1),
  abilityDesc: z.string().default(""),
  requiresUnlock: z.boolean().default(false),
  unlockCondition: z.string().nullable().default(null),
  stats: z.object({
    hp: z.number().nullable(),
    mana: z.number().nullable(),
    initialMana: z.number().nullable(),
    damage: z.number().nullable(),
    range: z.number().nullable()
  }),
  icon: z.string().min(1)
});

export const augmentRankSchema = z.enum(AUGMENT_RANKS);

export const augmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: augmentRankSchema,
  description: z.string().default(""),
  icon: z.string().min(1)
});

export const synergyBreakpointSchema = z.object({
  units: z.number().int().min(1),
  effect: z.string().default("")
});

export const synergySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().min(1),
  description: z.string().default(""),
  breakpoints: z.array(synergyBreakpointSchema).default([])
});

export const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  icon: z.string().min(1)
});

export const guideSectionSchema = z.object({
  title: z.string().min(1),
  lines: z.array(z.string().min(1))
});

export const compGuideSchema = z.object({
  overview: z.array(guideSectionSchema),
  phases: z.object({
    early: z.array(guideSectionSchema),
    mid: z.array(guideSectionSchema),
    late: z.array(guideSectionSchema)
  })
});

export const compSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  externalId: z.string().optional(),
  tier: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export const compSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  sources: z.array(compSourceSchema).default([]),
  phases: z.object({
    early: phaseSchema,
    mid: phaseSchema,
    late: phaseSchema
  }),
  recommendedAugmentIds: z.array(z.string().min(1)),
  guide: compGuideSchema,
  componentDemand: z.array(componentDemandSchema),
  notes: z.string().optional(),
  teamCode: z.string().optional()
});

export const datasetMetaSchema = z.object({
  schemaVersion: z.literal("1"),
  set: z.number().int(),
  generatedAt: z.string().datetime(),
  source: z.object({
    comps: z.string().min(1),
    champions: z.string().min(1),
    augmentRanks: z.string().min(1)
  })
});

export const datasetSchema = z.object({
  meta: datasetMetaSchema,
  comps: z.array(compSchema),
  championsById: z.record(championSchema),
  augmentsById: z.record(augmentSchema),
  synergiesById: z.record(synergySchema),
  itemsById: z.record(itemSchema).default({})
});

export type ComponentDemand = z.infer<typeof componentDemandSchema>;
export type BoardSlot = z.infer<typeof boardSlotSchema>;
export type PhaseData = z.infer<typeof phaseSchema>;
export type Champion = z.infer<typeof championSchema>;
export type Augment = z.infer<typeof augmentSchema>;
export type Synergy = z.infer<typeof synergySchema>;
export type SynergyBreakpoint = z.infer<typeof synergyBreakpointSchema>;
export type Item = z.infer<typeof itemSchema>;
export type GuideSection = z.infer<typeof guideSectionSchema>;
export type CompGuide = z.infer<typeof compGuideSchema>;
export type CompSource = z.infer<typeof compSourceSchema>;
export type Comp = z.infer<typeof compSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
