export const PANEL_IDS = [
  "filters",
  "sources",
  "activeRead",
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
  "inspector",
  "signals"
] as const;

export type DraggablePanelId = (typeof PANEL_IDS)[number];
export type PanelCssBoxValue = number | "auto" | "50%";
export type PanelDebugLayout = {
  width: PanelCssBoxValue;
  height: PanelCssBoxValue;
  top: PanelCssBoxValue;
  left: PanelCssBoxValue;
  right: PanelCssBoxValue;
  bottom: PanelCssBoxValue;
};
export type PanelResizeAnchors = {
  right: boolean;
  bottom: boolean;
};
export type PanelRegistryEntry = {
  id: DraggablePanelId;
  label: string;
  title: string;
  resizeAnchors: PanelResizeAnchors;
  debugLabel?: string;
  debugLayout?: PanelDebugLayout;
};

const topLeftAnchors: PanelResizeAnchors = { right: false, bottom: false };
const topRightAnchors: PanelResizeAnchors = { right: true, bottom: false };
const bottomLeftAnchors: PanelResizeAnchors = { right: false, bottom: true };
const bottomRightAnchors: PanelResizeAnchors = { right: true, bottom: true };

export const PANEL_REGISTRY: Record<DraggablePanelId, PanelRegistryEntry> = {
  filters: {
    id: "filters",
    label: "filters",
    title: "Filters",
    resizeAnchors: topLeftAnchors
  },
  sources: {
    id: "sources",
    label: "sources",
    title: "Sources",
    resizeAnchors: topLeftAnchors
  },
  activeRead: {
    id: "activeRead",
    label: "active read",
    title: "Active Read",
    resizeAnchors: topLeftAnchors
  },
  browser: {
    id: "browser",
    label: "build browser",
    title: "04 / Build Browser",
    resizeAnchors: topLeftAnchors,
    debugLabel: "Build Browser",
    debugLayout: {
      width: 900,
      height: 374,
      top: 42,
      left: "50%",
      right: "auto",
      bottom: "auto"
    }
  },
  buildControls: {
    id: "buildControls",
    label: "build controls",
    title: "00 / Build Controls",
    resizeAnchors: topLeftAnchors,
    debugLabel: "Build Controls",
    debugLayout: {
      width: 292,
      height: 306,
      top: 64,
      left: 22,
      right: "auto",
      bottom: "auto"
    }
  },
  selectedOverview: {
    id: "selectedOverview",
    label: "build overview",
    title: "01 / Overview",
    resizeAnchors: topRightAnchors,
    debugLabel: "Overview",
    debugLayout: {
      width: 380,
      height: 282,
      top: 64,
      left: "auto",
      right: 22,
      bottom: "auto"
    }
  },
  selectedBoard: {
    id: "selectedBoard",
    label: "board view",
    title: "02 / Board View",
    resizeAnchors: topRightAnchors,
    debugLabel: "Board View",
    debugLayout: {
      width: 340,
      height: 232,
      top: 250,
      left: "auto",
      right: 22,
      bottom: "auto"
    }
  },
  selectedSynergies: {
    id: "selectedSynergies",
    label: "synergies",
    title: "03 / Synergies",
    resizeAnchors: topLeftAnchors,
    debugLabel: "Synergies",
    debugLayout: {
      width: 292,
      height: 242,
      top: 390,
      left: 22,
      right: "auto",
      bottom: "auto"
    }
  },
  selectedAugments: {
    id: "selectedAugments",
    label: "recommended augments",
    title: "04 / Recommended Augments",
    resizeAnchors: bottomLeftAnchors,
    debugLabel: "Recommended Augments",
    debugLayout: {
      width: 350,
      height: 226,
      top: "auto",
      left: 650,
      right: "auto",
      bottom: 0
    }
  },
  selectedGamePlan: {
    id: "selectedGamePlan",
    label: "game plan",
    title: "05 / Game Plan",
    resizeAnchors: topLeftAnchors,
    debugLabel: "Game Plan",
    debugLayout: {
      width: 320,
      height: 260,
      top: 420,
      left: 650,
      right: "auto",
      bottom: "auto"
    }
  },
  selectedComponents: {
    id: "selectedComponents",
    label: "components",
    title: "06 / Components",
    resizeAnchors: topLeftAnchors,
    debugLabel: "Components",
    debugLayout: {
      width: 300,
      height: 226,
      top: 420,
      left: 330,
      right: "auto",
      bottom: "auto"
    }
  },
  selectedSimilarities: {
    id: "selectedSimilarities",
    label: "similarities",
    title: "09 / Similarities",
    resizeAnchors: bottomLeftAnchors,
    debugLabel: "Similarities",
    debugLayout: {
      width: 292,
      height: 226,
      top: "auto",
      left: 0,
      right: "auto",
      bottom: 0
    }
  },
  selectedGuide: {
    id: "selectedGuide",
    label: "levelling guide",
    title: "07 / Levelling Guide",
    resizeAnchors: bottomLeftAnchors,
    debugLabel: "Levelling Guide",
    debugLayout: {
      width: 300,
      height: 226,
      top: "auto",
      left: 330,
      right: "auto",
      bottom: 0
    }
  },
  inspector: {
    id: "inspector",
    label: "inspector",
    title: "08 / Inspector",
    resizeAnchors: bottomRightAnchors,
    debugLabel: "Inspector",
    debugLayout: {
      width: 320,
      height: 250,
      top: "auto",
      left: "auto",
      right: 0,
      bottom: 0
    }
  },
  signals: {
    id: "signals",
    label: "signals",
    title: "Signals",
    resizeAnchors: topLeftAnchors
  }
};

export const PANEL_DEBUG_IDS = [
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
] as const;
export type PanelDebugId = (typeof PANEL_DEBUG_IDS)[number];

export const PANEL_DEBUG_OPTIONS: Array<{ id: PanelDebugId; label: string }> = PANEL_DEBUG_IDS.map((id) => ({
  id,
  label: PANEL_REGISTRY[id].debugLabel ?? PANEL_REGISTRY[id].label
}));

export const DEFAULT_PANEL_DEBUG_LAYOUT = PANEL_DEBUG_IDS.reduce<Record<PanelDebugId, PanelDebugLayout>>(
  (layout, id) => {
    const debugLayout = PANEL_REGISTRY[id].debugLayout;
    if (debugLayout) {
      layout[id] = { ...debugLayout };
    }
    return layout;
  },
  {} as Record<PanelDebugId, PanelDebugLayout>
);

export function getDefaultResizeAnchors(id: DraggablePanelId): PanelResizeAnchors {
  return { ...PANEL_REGISTRY[id].resizeAnchors };
}
