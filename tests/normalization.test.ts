import { describe, expect, it } from "vitest";
import {
  normalizeAugmentLookup,
  normalizeChampionLookup,
  normalizeId
} from "../shared/normalization";

describe("normalization helpers", () => {
  it("normalizes known champion alias mismatches", () => {
    expect(normalizeChampionLookup("Luciansenna")).toBe(normalizeId("Lucian & Senna"));
    expect(normalizeChampionLookup("Drmundo")).toBe(normalizeId("Dr. Mundo"));
  });

  it("normalizes augment names with roman numeral suffixes", () => {
    expect(normalizeAugmentLookup("Band Of Thieves I")).toBe("bandofthieves1");
    expect(normalizeAugmentLookup("Treasure Hunt II")).toBe("treasurehunt2");
  });
});
