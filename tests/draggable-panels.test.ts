import { describe, expect, test } from "vitest";
import { getDefaultResizeAnchors, getResizeLayout } from "../src/hooks/useDraggablePanels";

const panelRect = {
  left: 700,
  top: 420,
  right: 1000,
  bottom: 646,
  width: 300,
  height: 226
};

describe("getResizeLayout", () => {
  test("uses CSS-matched default anchors for detail panels", () => {
    expect(getDefaultResizeAnchors("buildControls")).toEqual({ right: false, bottom: false });
    expect(getDefaultResizeAnchors("selectedOverview")).toEqual({ right: true, bottom: false });
    expect(getDefaultResizeAnchors("selectedBoard")).toEqual({ right: true, bottom: false });
    expect(getDefaultResizeAnchors("selectedComponents")).toEqual({ right: false, bottom: false });
    expect(getDefaultResizeAnchors("selectedGamePlan")).toEqual({ right: false, bottom: false });
    expect(getDefaultResizeAnchors("selectedGuide")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("selectedAugments")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("selectedSimilarities")).toEqual({ right: false, bottom: true });
    expect(getDefaultResizeAnchors("inspector")).toEqual({ right: true, bottom: true });
  });

  test("keeps right-anchored panels from translating when resizing from the left edge", () => {
    expect(
      getResizeLayout(
        { x: 0, y: 0, width: 300, height: 226 },
        panelRect,
        "left",
        { right: true, bottom: false },
        40,
        0
      )
    ).toEqual({ x: 0, y: 0, width: 260, height: 226 });
  });

  test("keeps bottom-anchored panels from translating when resizing from the top edge", () => {
    expect(
      getResizeLayout(
        { x: 0, y: 0, width: 300, height: 226 },
        panelRect,
        "top",
        { right: false, bottom: true },
        0,
        -32
      )
    ).toEqual({ x: 0, y: 0, width: 300, height: 258 });
  });
});
