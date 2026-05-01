import { describe, expect, test } from "vitest";
import {
  PANEL_DEBUG_OPTIONS,
  PANEL_IDS,
  PANEL_REGISTRY,
  getDefaultResizeAnchors
} from "../src/lib/panelRegistry";

describe("panel registry", () => {
  test("keeps every draggable panel in one registry", () => {
    expect(Object.keys(PANEL_REGISTRY)).toEqual(PANEL_IDS);
    expect(PANEL_IDS.map((id) => PANEL_REGISTRY[id].id)).toEqual(PANEL_IDS);
  });

  test("stores the user-facing panel chrome labels", () => {
    expect(PANEL_REGISTRY.browser).toMatchObject({
      label: "build browser",
      title: "04 / Build Browser"
    });
    expect(PANEL_REGISTRY.selectedComponents).toMatchObject({
      label: "components",
      title: "06 / Components"
    });
    expect(PANEL_REGISTRY.selectedGuide).toMatchObject({
      label: "levelling guide",
      title: "07 / Levelling Guide"
    });
  });

  test("uses CSS-matched default anchors for resizing", () => {
    expect(getDefaultResizeAnchors("selectedOverview")).toEqual({ right: true, bottom: false });
    expect(getDefaultResizeAnchors("selectedBoard")).toEqual({ right: true, bottom: false });
    expect(getDefaultResizeAnchors("selectedComponents")).toEqual({ right: false, bottom: false });
    expect(getDefaultResizeAnchors("selectedGamePlan")).toEqual({ right: false, bottom: false });
    expect(getDefaultResizeAnchors("selectedGuide")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("selectedAugments")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("selectedSimilarities")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("inspector")).toEqual({ right: true, bottom: true });
  });

  test("derives layout-debug panel choices from registry entries", () => {
    expect(PANEL_DEBUG_OPTIONS.map((option) => option.id)).toEqual([
      "browser",
      "buildControls",
      "selectedOverview",
      "selectedBoard",
      "selectedSynergies",
      "selectedAugments",
      "selectedGamePlan",
      "selectedComponents",
      "selectedSimilarities",
      "selectedGuide",
      "inspector"
    ]);
    expect(PANEL_DEBUG_OPTIONS.find((option) => option.id === "selectedAugments")?.label).toBe("Recommended Augments");
  });
});
