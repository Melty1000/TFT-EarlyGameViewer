import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PANEL_DEBUG_LAYOUT,
  PANEL_DEBUG_OPTIONS,
  type PanelCssBoxValue as CssBoxValue,
  type PanelDebugId as DebugPanelId,
  type PanelDebugLayout as DebugBoxLayout
} from "../lib/panelRegistry";

const DEBUG_LAYOUT_STORAGE_KEY = "opnr:aptos-layout-debug:v1";
const DEBUG_DEFAULT_LAYOUT_STORAGE_KEY = "opnr:aptos-layout-debug-default:v1";
const PANEL_LIVE_LAYOUT_EVENT = "opnr:aptos-panel-live-layout";
const DEBUG_FIELDS: Array<keyof DebugBoxLayout> = ["width", "height", "top", "left", "right", "bottom"];
const MIN_BROWSER_LAYOUT = { width: 840, height: 340 };
const DEBUG_PANEL_OPTIONS = PANEL_DEBUG_OPTIONS;
const DEFAULT_DEBUG_LAYOUT = DEFAULT_PANEL_DEBUG_LAYOUT;

function isDebugPanelId(value: string): value is DebugPanelId {
  return DEBUG_PANEL_OPTIONS.some((option) => option.id === value);
}

function normalizeCssBoxValue(value: unknown, fallback: CssBoxValue): CssBoxValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (value === "auto" || value === "50%") {
    return value;
  }

  return fallback;
}

function normalizeLayout(value: unknown): Record<DebugPanelId, DebugBoxLayout> {
  if (!value || typeof value !== "object") {
    return cloneLayout(DEFAULT_DEBUG_LAYOUT);
  }

  return DEBUG_PANEL_OPTIONS.reduce<Record<DebugPanelId, DebugBoxLayout>>((layout, option) => {
    const rawPanel = (value as Partial<Record<DebugPanelId, Partial<DebugBoxLayout>>>)[option.id];
    const defaults = DEFAULT_DEBUG_LAYOUT[option.id];
    const panel = {
      width: normalizeCssBoxValue(rawPanel?.width, defaults.width),
      height: normalizeCssBoxValue(rawPanel?.height, defaults.height),
      top: normalizeCssBoxValue(rawPanel?.top, defaults.top),
      left: normalizeCssBoxValue(rawPanel?.left, defaults.left),
      right: normalizeCssBoxValue(rawPanel?.right, defaults.right),
      bottom: normalizeCssBoxValue(rawPanel?.bottom, defaults.bottom)
    };

    if (option.id === "browser") {
      const hadLegacyBrowserSize = panel.width === 640 || panel.height === 318;
      if (typeof panel.width === "number" && panel.width < MIN_BROWSER_LAYOUT.width) {
        panel.width = DEFAULT_DEBUG_LAYOUT.browser.width;
      }
      if (typeof panel.height === "number" && panel.height < MIN_BROWSER_LAYOUT.height) {
        panel.height = DEFAULT_DEBUG_LAYOUT.browser.height;
      }
      if (hadLegacyBrowserSize && panel.top === 86) {
        panel.top = DEFAULT_DEBUG_LAYOUT.browser.top;
      }
    }

    layout[option.id] = panel;
    return layout;
  }, cloneLayout(DEFAULT_DEBUG_LAYOUT));
}

function cloneLayout(layout: Record<DebugPanelId, DebugBoxLayout>): Record<DebugPanelId, DebugBoxLayout> {
  return DEBUG_PANEL_OPTIONS.reduce<Record<DebugPanelId, DebugBoxLayout>>((nextLayout, option) => {
    nextLayout[option.id] = { ...layout[option.id] };
    return nextLayout;
  }, {} as Record<DebugPanelId, DebugBoxLayout>);
}

function readStoredLayout(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? normalizeLayout(JSON.parse(storedValue)) : null;
  } catch {
    return null;
  }
}

function getInitialDebugState() {
  if (typeof window === "undefined") {
    const layout = cloneLayout(DEFAULT_DEBUG_LAYOUT);
    return { layout, defaultLayout: cloneLayout(layout) };
  }

  const storedLayout = readStoredLayout(DEBUG_LAYOUT_STORAGE_KEY);
  const storedDefaultLayout = readStoredLayout(DEBUG_DEFAULT_LAYOUT_STORAGE_KEY);
  const defaultLayout = storedDefaultLayout ?? storedLayout ?? cloneLayout(DEFAULT_DEBUG_LAYOUT);
  const layout = storedLayout ?? cloneLayout(defaultLayout);

  if (!storedDefaultLayout && storedLayout) {
    saveDebugDefaultLayout(defaultLayout);
  }

  return {
    layout: cloneLayout(layout),
    defaultLayout: cloneLayout(defaultLayout)
  };
}

function cssValue(value: CssBoxValue) {
  return typeof value === "number" ? `${value}px` : value;
}

function browserTranslateX(layout: DebugBoxLayout) {
  return layout.left === "50%" ? "-50%" : "0";
}

function formatValue(value: CssBoxValue) {
  return typeof value === "number" ? String(value) : value;
}

function stringifyLayout(layout: Record<DebugPanelId, DebugBoxLayout>) {
  return DEBUG_PANEL_OPTIONS.map(({ id, label }) => {
    const panel = layout[id];
    return `${label}: ${DEBUG_FIELDS.map((field) => `${field} ${formatValue(panel[field])}`).join(", ")}`;
  }).join("\n");
}

function saveDebugLayout(layout: Record<DebugPanelId, DebugBoxLayout>) {
  window.localStorage.setItem(DEBUG_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function saveDebugDefaultLayout(layout: Record<DebugPanelId, DebugBoxLayout>) {
  window.localStorage.setItem(DEBUG_DEFAULT_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function hasStoredDebugLayout() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(
    window.localStorage.getItem(DEBUG_LAYOUT_STORAGE_KEY) ||
      window.localStorage.getItem(DEBUG_DEFAULT_LAYOUT_STORAGE_KEY)
  );
}

function getOppositeField(field: keyof DebugBoxLayout): keyof DebugBoxLayout | null {
  if (field === "left") return "right";
  if (field === "right") return "left";
  if (field === "top") return "bottom";
  if (field === "bottom") return "top";
  return null;
}

function nudgeValue(value: CssBoxValue, amount: number) {
  return typeof value === "number" ? Math.round(value + amount) : amount;
}

function getLiveDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function PanelLayoutDebug() {
  const [open, setOpen] = useState(false);
  const [layoutActive, setLayoutActive] = useState(() => hasStoredDebugLayout());
  const [selectedPanelId, setSelectedPanelId] = useState<DebugPanelId>("selectedBoard");
  const [defaultLayout, setDefaultLayout] = useState<Record<DebugPanelId, DebugBoxLayout>>(
    () => getInitialDebugState().defaultLayout
  );
  const [layout, setLayout] = useState<Record<DebugPanelId, DebugBoxLayout>>(() => getInitialDebugState().layout);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const selectedLayout = layout[selectedPanelId];
  const layoutText = useMemo(() => stringifyLayout(layout), [layout]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.key !== "F9" && event.code !== "F9") || event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setLayoutActive(true);
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!layoutActive) {
      return;
    }

    const root = document.querySelector<HTMLElement>(".dot-test-shell");
    if (!root) {
      return;
    }

    for (const { id } of DEBUG_PANEL_OPTIONS) {
      for (const field of DEBUG_FIELDS) {
        root.style.setProperty(`--opnr-debug-${id}-${field}`, cssValue(layout[id][field]));
      }
    }
    root.style.setProperty("--opnr-debug-browser-translate-x", browserTranslateX(layout.browser));

    saveDebugLayout(layout);
  }, [layout, layoutActive]);

  useEffect(() => {
    if (!layoutActive) {
      return;
    }

    const handleLiveLayout = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const id = detail?.id;
      if (typeof id !== "string" || !isDebugPanelId(id)) {
        return;
      }

      const width = getLiveDimension(detail?.layout?.width);
      const height = getLiveDimension(detail?.layout?.height);
      if (!width && !height) {
        return;
      }

      setLayout((current) => {
        const nextPanel = {
          ...current[id],
          ...(width ? { width } : {}),
          ...(height ? { height } : {})
        };

        if (nextPanel.width === current[id].width && nextPanel.height === current[id].height) {
          return current;
        }

        return {
          ...current,
          [id]: nextPanel
        };
      });
    };

    window.addEventListener(PANEL_LIVE_LAYOUT_EVENT, handleLiveLayout);

    return () => {
      window.removeEventListener(PANEL_LIVE_LAYOUT_EVENT, handleLiveLayout);
    };
  }, [layoutActive]);

  const updatePanelField = (panelId: DebugPanelId, field: keyof DebugBoxLayout, value: CssBoxValue) => {
    setLayout((current) => {
      const oppositeField = getOppositeField(field);
      const nextPanel = {
        ...current[panelId],
        [field]: value
      };

      if (oppositeField && typeof value === "number") {
        nextPanel[oppositeField] = "auto";
      }

      return {
        ...current,
        [panelId]: nextPanel
      };
    });
  };

  const resetSelected = () => {
    setLayout((current) => ({
      ...current,
      [selectedPanelId]: { ...defaultLayout[selectedPanelId] }
    }));
  };

  const resetAll = () => {
    window.localStorage.removeItem(DEBUG_LAYOUT_STORAGE_KEY);
    setLayout(cloneLayout(defaultLayout));
  };

  const makeDefault = () => {
    const promotedLayout = cloneLayout(layout);
    setDefaultLayout(promotedLayout);
    saveDebugDefaultLayout(promotedLayout);
  };

  const nudgeSelected = (x: number, y: number) => {
    setLayout((current) => {
      const panel = current[selectedPanelId];
      const nextPanel = { ...panel };

      if (x !== 0) {
        if (typeof nextPanel.left === "number") {
          nextPanel.left = nudgeValue(nextPanel.left, x);
          nextPanel.right = "auto";
        } else if (typeof nextPanel.right === "number") {
          nextPanel.right = nudgeValue(nextPanel.right, -x);
          nextPanel.left = "auto";
        } else {
          nextPanel.left = x;
          nextPanel.right = "auto";
        }
      }

      if (y !== 0) {
        if (typeof nextPanel.top === "number") {
          nextPanel.top = nudgeValue(nextPanel.top, y);
          nextPanel.bottom = "auto";
        } else if (typeof nextPanel.bottom === "number") {
          nextPanel.bottom = nudgeValue(nextPanel.bottom, -y);
          nextPanel.top = "auto";
        } else {
          nextPanel.top = y;
          nextPanel.bottom = "auto";
        }
      }

      return {
        ...current,
        [selectedPanelId]: nextPanel
      };
    });
  };

  const copyLayout = async () => {
    try {
      await navigator.clipboard.writeText(layoutText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  if (!open) {
    return null;
  }

  return (
    <section className="panel-layout-debug is-open" aria-label="Temporary layout debug panel">
      <button
        type="button"
        className="panel-layout-debug-toggle glitch-hover"
        aria-keyshortcuts="F9"
        title="Press F9 to close"
        onClick={() => setOpen(false)}
      >
        [ Layout Debug / F9 ]
      </button>

      <div className="panel-layout-debug-body">
        <label className="panel-layout-debug-field span-all">
          <span>Panel</span>
          <select
            value={selectedPanelId}
            onChange={(event) => {
              if (isDebugPanelId(event.target.value)) {
                setSelectedPanelId(event.target.value);
              }
            }}
          >
            {DEBUG_PANEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {DEBUG_FIELDS.map((field) => (
          <label key={field} className="panel-layout-debug-field">
            <span>{field}</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatValue(selectedLayout[field])}
              onChange={(event) => {
                const rawValue = event.target.value.trim();
                const numericValue = Number(rawValue);
                const nextValue = rawValue === "" || rawValue.toLowerCase() === "auto"
                  ? "auto"
                  : rawValue === "50%"
                    ? "50%"
                    : Number.isFinite(numericValue)
                      ? numericValue
                      : selectedLayout[field];
                updatePanelField(selectedPanelId, field, nextValue);
              }}
            />
          </label>
        ))}

        <div className="panel-layout-debug-nudges span-all">
          <button type="button" onClick={() => nudgeSelected(0, -8)}>[ Up ]</button>
          <button type="button" onClick={() => nudgeSelected(-8, 0)}>[ Left ]</button>
          <button type="button" onClick={() => nudgeSelected(8, 0)}>[ Right ]</button>
          <button type="button" onClick={() => nudgeSelected(0, 8)}>[ Down ]</button>
        </div>

        <div className="panel-layout-debug-actions span-all">
          <button type="button" onClick={resetSelected}>[ Reset Selected ]</button>
          <button type="button" onClick={resetAll}>[ Reset All ]</button>
          <button type="button" onClick={makeDefault}>[ Make Default ]</button>
          <button type="button" onClick={copyLayout}>[{copyState === "copied" ? " Copied " : copyState === "error" ? " Copy Error " : " Copy Layout "}]</button>
        </div>

        <textarea className="panel-layout-debug-output span-all" readOnly value={layoutText} />
      </div>
    </section>
  );
}
