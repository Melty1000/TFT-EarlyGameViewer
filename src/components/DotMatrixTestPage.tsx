import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PhaseKey } from "../../shared/normalization";
import { COMPONENT_LABELS, PHASES } from "../../shared/normalization";
import type { Comp, Dataset } from "../../shared/tft";
import { CompListPane, getInitialCompListSelection } from "./CompListPane";
import {
  buildInspectorModel,
  LevellingGuideContent,
  renderAugment,
  renderChampionTile,
  type InspectorTarget
} from "./DetailPane";
import { RankBadge } from "./RankBadge";
import { TitleBar } from "./TitleBar";
import { useDraggablePanels, type DraggablePanelId } from "../hooks/useDraggablePanels";
import { useThemeMode } from "../hooks/useThemeMode";
import {
  getCompDisplayTitle,
  getCompPlaystyle,
  getCompRankTags,
  getPlaystyleIcon,
  getPlaystyleLabel,
  getSourceAbbreviation,
  getSourceDisplayName
} from "../lib/compMeta";
import { compMatchesFilters, type PhaseFilter } from "../lib/filters";
import {
  getCompletedItemRecipeGroups,
  getDetailPanelGuideGroups,
  getLevellingGuideSection
} from "../lib/detailPanelContent";
import { rankCompsBySimilarity, type SimilaritySelection } from "../lib/similarity";
import { PANEL_REGISTRY } from "../lib/panelRegistry";
import { useDataset } from "../lib/useDataset";

type Point = {
  x: number;
  y: number;
};

type DotPalette = {
  background: string;
  base: [number, number, number];
  accent: [number, number, number];
  flash: [number, number, number];
};

const DOT_SPACING = 14;
const BASE_DOT_RADIUS = 1;
const WARP_RADIUS = 228;
const MAX_PUSH = 20;
const NEAR_MOUSE_PUSH = 0;
const MAX_ANGULAR_WARP = 1.08;
const MAX_SWIRL_PUSH = 86;
const VELOCITY_SCALE = 14;
const VELOCITY_EASE = 0.14;
const SPIN_EASE = 0.11;
const SPIN_DECAY = 0.988;
const MAX_SPIN_STEP = 0.026;
const SETTLE_VELOCITY = 0.018;
const SIZE_LIFT = 1.5;
const CLICK_FLASH_DURATION = 440;
const CLICK_FLASH_RADIUS = 252;
const DECODE_GLYPHS = "01[]{}<>/\\|+-=#%";
const PHASE_FILTER_OPTIONS: PhaseFilter[] = ["all", ...PHASES];
const EMPTY_SIMILARITY_SELECTION: SimilaritySelection = {
  championIds: [],
  augmentIds: [],
  itemIds: [],
  componentIds: []
};
const SIMILARITY_AUGMENT_TIER_ORDER: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  Unknown: 5
};

type SimilarityEntityKind = "champion" | "augment" | "item" | "component";

type SimilarityEntityOption = {
  kind: SimilarityEntityKind;
  id: string;
  name: string;
  icon: string;
  meta?: string;
};

function getDotPalette(themeMode: "dark" | "light"): DotPalette {
  if (themeMode === "light") {
    return {
      background: "#f3f4ed",
      base: [18, 18, 18],
      accent: [242, 98, 44],
      flash: [247, 247, 242]
    };
  }

  return {
    background: "#08090d",
    base: [244, 244, 244],
    accent: [217, 249, 51],
    flash: [247, 247, 247]
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function lerp(start: number, end: number, value: number) {
  return start + (end - start) * value;
}

function mixRgb(
  from: [number, number, number],
  to: [number, number, number],
  value: number
): [number, number, number] {
  return [
    Math.round(lerp(from[0], to[0], value)),
    Math.round(lerp(from[1], to[1], value)),
    Math.round(lerp(from[2], to[2], value))
  ];
}

function getEncodedText(label: string, revealedCount: number) {
  return label
    .split("")
    .map((character, index) => {
      if (character === " ") {
        return " ";
      }

      if (index < revealedCount) {
        return character;
      }

      return DECODE_GLYPHS[(index + revealedCount * 3) % DECODE_GLYPHS.length];
    })
    .join("");
}

function getProjectedDot(x: number, y: number, pointer: Point | null, spin: number) {
  if (!pointer) {
    return { x, y, falloff: 0, spinDirection: 0 };
  }

  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const normalizedDistance = clamp(distance / WARP_RADIUS, 0, 1);
  const falloff = smoothstep(1 - normalizedDistance);
  const displacementBand = Math.sin(normalizedDistance * Math.PI) * falloff;
  const dotAngle = Math.atan2(dy, dx);
  const angularWarp = spin * displacementBand * MAX_ANGULAR_WARP;

  const push = displacementBand * MAX_PUSH + falloff * falloff * NEAR_MOUSE_PUSH;
  const projectedDistance = distance + push;
  const projectedAngle = dotAngle + angularWarp;
  const swirlPush = spin * displacementBand * MAX_SWIRL_PUSH;

  return {
    x: pointer.x + Math.cos(projectedAngle) * projectedDistance + (-dy / distance) * swirlPush,
    y: pointer.y + Math.sin(projectedAngle) * projectedDistance + (dx / distance) * swirlPush,
    falloff,
    spinDirection: spin
  };
}

function getClickFlashFrame(elapsed: number) {
  if (elapsed < 0 || elapsed >= CLICK_FLASH_DURATION) {
    return null;
  }

  const progress = elapsed / CLICK_FLASH_DURATION;

  if (progress < 0.12) {
    return { intensity: 0.22, color: 0.28, offsetX: 0, offsetY: 0, radialPush: 0 };
  }

  if (progress < 0.26) {
    return { intensity: 1, color: 1, offsetX: 8, offsetY: -2, radialPush: 5 };
  }

  if (progress < 0.42) {
    return { intensity: 0.9, color: 0.84, offsetX: -5, offsetY: 2, radialPush: -2 };
  }

  if (progress < 0.68) {
    return { intensity: 0.68, color: 0.62, offsetX: 4, offsetY: 0, radialPush: 3 };
  }

  return { intensity: 0.24, color: 0.24, offsetX: 0, offsetY: 0, radialPush: 0 };
}

export function DotMatrixTestPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { themeMode, toggleThemeMode } = useThemeMode();
  const { data, error, isLoading } = useDataset();
  const draggablePanels = useDraggablePanels();
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedBuildPhase, setSelectedBuildPhase] = useState<PhaseKey>("late");
  const [inspector, setInspector] = useState<InspectorTarget>(null);
  const [lockedInspector, setLockedInspector] = useState<InspectorTarget>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [liveQuery, setLiveQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [hiddenSourceKeys, setHiddenSourceKeys] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [similaritySelection, setSimilaritySelection] = useState<SimilaritySelection>(EMPTY_SIMILARITY_SELECTION);

  const sourceOptions = useMemo(() => {
    if (!data) {
      return [];
    }

    const seen = new Set<string>();
    return data.comps.flatMap((comp) => {
      const rawSource = comp.sources[0]?.name ?? "source";
      const key = getSourceDisplayName(rawSource);
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);

      return [
        {
          key,
          label: key,
          abbreviation: getSourceAbbreviation(rawSource)
        }
      ];
    });
  }, [data]);

  const sourceFilteredComps = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.comps.filter((comp) => !hiddenSourceKeys.includes(getSourceDisplayName(comp.sources[0]?.name ?? "source")));
  }, [data, hiddenSourceKeys]);

  const filteredComps = useMemo(() => {
    if (!data) {
      return [];
    }

    return sourceFilteredComps.filter((comp) => compMatchesFilters(comp, data, phaseFilter, chips, liveQuery));
  }, [chips, data, liveQuery, phaseFilter, sourceFilteredComps]);
  const similaritySelectionCount = getSimilaritySelectionCount(similaritySelection);
  const similarityResults = useMemo(() => {
    if (!data || !similaritySelectionCount) {
      return [];
    }

    return rankCompsBySimilarity(filteredComps, data, similaritySelection, selectedBuildPhase).filter(
      (result) => result.score > 0
    );
  }, [data, filteredComps, selectedBuildPhase, similaritySelection, similaritySelectionCount]);
  const browserComps = useMemo(
    () => (similaritySelectionCount ? similarityResults.map((result) => result.comp) : filteredComps),
    [filteredComps, similarityResults, similaritySelectionCount]
  );
  const initialVisibleCompId = useMemo(
    () => getInitialCompListSelection(browserComps, similaritySelectionCount > 0),
    [browserComps, similaritySelectionCount]
  );
  const similarityReadouts = useMemo(
    () =>
      similarityResults.reduce<Record<string, { score: number; percent: number }>>((readouts, result) => {
        readouts[result.comp.id] = {
          score: result.score,
          percent: Math.round(result.matchPercent * 100)
        };
        return readouts;
      }, {}),
    [similarityResults]
  );

  const selectedComp = useMemo(() => {
    if (!data || !selectedCompId) {
      return null;
    }

    return data.comps.find((comp) => comp.id === selectedCompId) ?? null;
  }, [data, selectedCompId]);

  useEffect(() => {
    const selectedStillVisible = selectedCompId ? browserComps.some((comp) => comp.id === selectedCompId) : false;
    if (selectedStillVisible) {
      return;
    }

    const nextSelectedId = initialVisibleCompId;
    if (nextSelectedId === selectedCompId) {
      return;
    }

    setSelectedCompId(nextSelectedId);
    setInspector(null);
    setLockedInspector(null);
    setCopyState("idle");
  }, [browserComps, initialVisibleCompId, selectedCompId]);

  const activeInspector = selectedComp && data
    ? buildInspectorModel(selectedComp, data, selectedBuildPhase, lockedInspector ?? inspector)
    : null;
  const browserPanel = PANEL_REGISTRY.browser;

  const addChip = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setChips((current) => (current.includes(normalized) ? current : [...current, normalized]));
  };

  const removeChip = (value: string) => {
    setChips((current) => current.filter((chip) => chip !== value));
  };

  const commitDraftChip = () => {
    const value = draftQuery.trim();
    if (!value) {
      return;
    }

    addChip(value);
    setDraftQuery("");
    setLiveQuery("");
  };

  const resetBuildControls = () => {
    setChips([]);
    setDraftQuery("");
    setLiveQuery("");
    setPhaseFilter("all");
    setHiddenSourceKeys([]);
    setSimilaritySelection(EMPTY_SIMILARITY_SELECTION);
  };

  const toggleSourceVisibility = (sourceKey: string) => {
    setHiddenSourceKeys((current) =>
      current.includes(sourceKey) ? current.filter((key) => key !== sourceKey) : [...current, sourceKey]
    );
  };

  const handleSelectComp = (compId: string) => {
    setSelectedCompId(compId);
    setInspector(null);
    setLockedInspector(null);
    setCopyState("idle");
  };

  const setLiveInspector = (target: InspectorTarget) => {
    if (lockedInspector) {
      return;
    }

    setInspector(target);
  };

  const toggleInspectorLock = (target: InspectorTarget) => {
    setInspector(target);
    setLockedInspector((current) => {
      const isSame = current && target && current.kind === target.kind && current.id === target.id;
      return isSame ? null : target;
    });
  };

  const copySelectedTeamCode = async () => {
    if (!selectedComp?.teamCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedComp.teamCode);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => setCopyState("idle"), 1500);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") {
      return;
    }

    const isJsdom = window.navigator.userAgent.toLowerCase().includes("jsdom");
    const context = isJsdom ? null : canvas.getContext("2d", { alpha: false });
    if (!context) {
      return;
    }

    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let pointer: Point | null = null;
    const palette = getDotPalette(themeMode);
    const pointerTarget: Point = { x: 0, y: 0 };
    const pointerCurrent: Point = { x: 0, y: 0 };
    const targetVelocity: Point = { x: 0, y: 0 };
    const smoothedVelocity: Point = { x: 0, y: 0 };
    let spinImpulse = 0;
    let clickFlash: (Point & { startedAt: number }) | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const queueDraw = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const setStatic = () => {
      pointer = null;
      targetVelocity.x = 0;
      targetVelocity.y = 0;
      smoothedVelocity.x = 0;
      smoothedVelocity.y = 0;
      spinImpulse = 0;
      clickFlash = null;
      canvas.dataset.pointerActive = "false";
      canvas.dataset.clickFlash = "false";
      queueDraw();
    };

    const drawDots = (now: number) => {
      let clearedDots = 0;
      let displacedDots = 0;
      const activePointer = pointer;
      const activeVelocity = activePointer ? smoothedVelocity : { x: 0, y: 0 };
      const activeSpin = activePointer ? spinImpulse : 0;
      const activeClickFlash = clickFlash;
      const clickFlashFrame = activeClickFlash ? getClickFlashFrame(now - activeClickFlash.startedAt) : null;

      if (activeClickFlash && !clickFlashFrame) {
        clickFlash = null;
        canvas.dataset.clickFlash = "false";
      }

      context.fillStyle = palette.background;
      context.fillRect(0, 0, width, height);

      for (let y = DOT_SPACING / 2; y < height + DOT_SPACING; y += DOT_SPACING) {
        for (let x = DOT_SPACING / 2; x < width + DOT_SPACING; x += DOT_SPACING) {
          const projected = getProjectedDot(x, y, activePointer, activeSpin);
          let flashFalloff = 0;
          let drawX = projected.x;
          let drawY = projected.y;

          if (activeClickFlash && clickFlashFrame) {
            const flashDx = x - activeClickFlash.x;
            const flashDy = y - activeClickFlash.y;
            const flashDistance = Math.max(Math.hypot(flashDx, flashDy), 1);
            const flashDistance01 = clamp(flashDistance / CLICK_FLASH_RADIUS, 0, 1);
            flashFalloff = smoothstep(1 - flashDistance01) * clickFlashFrame.intensity;

            if (flashFalloff > 0.001) {
              drawX +=
                clickFlashFrame.offsetX * flashFalloff +
                (flashDx / flashDistance) * clickFlashFrame.radialPush * flashFalloff;
              drawY +=
                clickFlashFrame.offsetY * flashFalloff +
                (flashDy / flashDistance) * clickFlashFrame.radialPush * flashFalloff;
            }
          }

          if (drawX < -12 || drawX > width + 12 || drawY < -12 || drawY > height + 12) {
            continue;
          }

          if (projected.falloff > 0.02 || flashFalloff > 0.02) {
            displacedDots += 1;
          }

          const radius = BASE_DOT_RADIUS;
          const alpha = clamp(0.54 + projected.falloff * 0.32 + flashFalloff * 0.2, 0.18, 0.96);
          const colorMix = Math.max(
            smoothstep(clamp(projected.falloff * 1.25, 0, 1)),
            smoothstep(clamp(flashFalloff * 1.45, 0, 1)) * (clickFlashFrame?.color ?? 0)
          );
          const flashMix = smoothstep(clamp(flashFalloff * 1.65, 0, 1)) * (clickFlashFrame?.color ?? 0);
          const dotColor = flashMix > 0
            ? mixRgb(mixRgb(palette.base, palette.accent, colorMix), palette.flash, flashMix)
            : mixRgb(palette.base, palette.accent, colorMix);
          const [red, green, blue] = dotColor;

          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          context.fillRect(Math.round(drawX) - 1, Math.round(drawY), 3, 1);
        }
      }

      canvas.dataset.clearedDots = String(clearedDots);
      canvas.dataset.displacedDots = String(displacedDots);
      canvas.dataset.influence = activePointer ? "1.000" : "0.000";
      canvas.dataset.velocity = Math.hypot(activeVelocity.x, activeVelocity.y).toFixed(3);
      canvas.dataset.spinDirection = activeSpin.toFixed(3);
    };

    const draw = () => {
      frame = 0;
      const now = performance.now();

      if (pointer) {
        pointerCurrent.x = pointerTarget.x;
        pointerCurrent.y = pointerTarget.y;
        smoothedVelocity.x += (targetVelocity.x - smoothedVelocity.x) * VELOCITY_EASE;
        smoothedVelocity.y += (targetVelocity.y - smoothedVelocity.y) * VELOCITY_EASE;
        targetVelocity.x *= 0.82;
        targetVelocity.y *= 0.82;

        const spinTarget = clamp((-smoothedVelocity.x + smoothedVelocity.y) / VELOCITY_SCALE, -1, 1);
        const spinStep = clamp((spinTarget - spinImpulse) * SPIN_EASE, -MAX_SPIN_STEP, MAX_SPIN_STEP);
        spinImpulse += spinStep;
        spinImpulse *= SPIN_DECAY;
        pointer = { x: pointerCurrent.x, y: pointerCurrent.y };
      }

      drawDots(now);

      if (
        (pointer &&
          (Math.hypot(targetVelocity.x, targetVelocity.y) > SETTLE_VELOCITY ||
          Math.hypot(smoothedVelocity.x, smoothedVelocity.y) > SETTLE_VELOCITY ||
            Math.abs(spinImpulse) > 0.006)) ||
        clickFlash
      ) {
        queueDraw();
      }
    };

    const getCanvasPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      return {
        x: clamp(x, 0, rect.width),
        y: clamp(y, 0, rect.height),
        inside: x >= 0 && x <= rect.width && y >= 0 && y <= rect.height
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = getCanvasPoint(event);
      if (!point.inside) {
        setStatic();
        return;
      }

      if (!pointer) {
        pointerCurrent.x = point.x;
        pointerCurrent.y = point.y;
        pointerTarget.x = point.x;
        pointerTarget.y = point.y;
        targetVelocity.x = 0;
        targetVelocity.y = 0;
        smoothedVelocity.x = 0;
        smoothedVelocity.y = 0;
        spinImpulse = 0;
      } else {
        targetVelocity.x = targetVelocity.x * 0.4 + (point.x - pointerTarget.x) * 0.6;
        targetVelocity.y = targetVelocity.y * 0.4 + (point.y - pointerTarget.y) * 0.6;
      }

      pointerTarget.x = point.x;
      pointerTarget.y = point.y;
      pointerCurrent.x = point.x;
      pointerCurrent.y = point.y;
      pointer = { x: point.x, y: point.y };
      canvas.dataset.pointerActive = "true";
      canvas.dataset.pointerX = point.x.toFixed(1);
      canvas.dataset.pointerY = point.y.toFixed(1);
      queueDraw();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const point = getCanvasPoint(event);
      if (!point.inside) {
        return;
      }

      if (!pointer) {
        pointerCurrent.x = point.x;
        pointerCurrent.y = point.y;
        pointerTarget.x = point.x;
        pointerTarget.y = point.y;
        targetVelocity.x = 0;
        targetVelocity.y = 0;
        smoothedVelocity.x = 0;
        smoothedVelocity.y = 0;
        spinImpulse = 0;
        pointer = { x: point.x, y: point.y };
      }

      clickFlash = { x: point.x, y: point.y, startedAt: performance.now() };
      canvas.dataset.clickFlash = "true";
      queueDraw();
    };

    const resizeAndDraw = () => {
      resize();
      queueDraw();
    };

    resizeAndDraw();

    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(() => {
            resizeAndDraw();
          })
        : null;

    resizeObserver?.observe(canvas);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerleave", setStatic);
    window.addEventListener("blur", setStatic);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      resizeObserver?.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerleave", setStatic);
      window.removeEventListener("blur", setStatic);
    };
  }, [themeMode]);

  const browserPanelProps = draggablePanels.getPanelProps("browser");
  const { className: browserPanelStateClass, ...browserPanelRest } = browserPanelProps;
  const browserDragHandle = draggablePanels.getDragSurfaceProps("browser", browserPanel.label);
  const browserCollapsed = draggablePanels.isPanelCollapsed("browser");
  const browserResizeHandles = getPanelResizeHandles(draggablePanels, "browser", browserPanel.label);

  return (
    <main className={menuOpen ? "dot-test-shell is-menu-open" : "dot-test-shell"}>
      <canvas
        ref={canvasRef}
        className="dot-test-canvas"
        data-testid="dot-test-canvas"
        data-page="dot-reactivity-test"
        data-layer-count="1"
        data-idle-motion="static"
        data-warp-mode="velocity-spin-dot-displacement"
        data-pointer-active="false"
        data-cleared-dots="0"
        data-displaced-dots="0"
        data-influence="0.000"
        data-velocity="0.000"
        data-spin-direction="0"
        data-click-flash="false"
      />

      <header className="aptos-header dot-test-header">
        <button
          type="button"
          className="bracket-button glitch-hover"
          aria-label="Open OPNR menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          [ Menu ]
        </button>

        <div className="aptos-wordmark glitch-text" data-text="OPNR.GG">
          OPNR.GG
        </div>

        <div className="aptos-header-right">
          <button
            type="button"
            className="theme-button glitch-hover"
            aria-label="Toggle Aptos theme"
            onClick={toggleThemeMode}
          >
            [ {themeMode === "dark" ? "Light" : "Dark"} ]
          </button>
          <TitleBar variant="controls" />
        </div>
      </header>

      <section className="dot-test-build-browser" aria-label="Build browser concept panel">
        <section
          className={`aptos-lab-panel browser-panel dot-test-build-browser-panel ${browserPanelStateClass}`}
          {...browserPanelRest}
        >
          <div
            {...browserDragHandle}
            className={`${browserDragHandle.className} aptos-panel-header dot-test-build-browser-drag-bar`}
          >
            <span>{browserPanel.title}</span>
            <span className="dot-test-panel-status">
              {data
                ? similaritySelectionCount
                  ? `${browserComps.length} similar`
                  : `${browserComps.length} records`
                : isLoading
                  ? "loading"
                  : "offline"}
            </span>
            <span className="dot-test-drag-label">[ Drag ]</span>
            <PanelCollapseButton
              collapsed={browserCollapsed}
              label={browserPanel.label}
              onClick={() => draggablePanels.togglePanelCollapsed("browser")}
            />
          </div>

          <div className="aptos-panel-body" hidden={browserCollapsed}>
            <div className="browser-panel-head">
              <div className="browser-panel-summary">
                <span>{similaritySelectionCount ? "Similarity ranked records" : "Sortable build records"}</span>
                <strong>{data ? `${browserComps.length} visible` : isLoading ? "syncing" : "dataset error"}</strong>
              </div>
              <BuildBrowserPhaseSelector
                selectedBuildPhase={selectedBuildPhase}
                onSelectedBuildPhaseChange={setSelectedBuildPhase}
              />
            </div>

            <div className="aptos-main-surface">
              {isLoading ? (
                <div className="dot-test-browser-state">
                  <p className="eyebrow">Loading</p>
                  <h2>Preparing build records.</h2>
                </div>
              ) : error || !data ? (
                <div className="dot-test-browser-state">
                  <p className="eyebrow">Dataset error</p>
                  <h2>Build browser unavailable.</h2>
                  <p>{error ?? "Unknown dataset issue"}</p>
                </div>
              ) : (
                <CompListPane
                  comps={browserComps}
                  dataset={data}
                  phaseFilter={phaseFilter}
                  onQuickFilter={addChip}
                  selectedCompId={selectedCompId}
                  onSelectComp={handleSelectComp}
                  similarityReadouts={similarityReadouts}
                  selectionOnly
                />
              )}
            </div>
          </div>
          {browserCollapsed ? null : browserResizeHandles}
        </section>
      </section>

      <section className="dot-test-detail-panels" aria-label="Selected build detail panels">
        <DotTestDraggablePanel id="buildControls" draggablePanels={draggablePanels}>
          <BuildControlsPanel
            data={data}
            filteredCount={browserComps.length}
            chips={chips}
            liveQuery={liveQuery}
            draftQuery={draftQuery}
            phaseFilter={phaseFilter}
            sourceOptions={sourceOptions}
            hiddenSourceKeys={hiddenSourceKeys}
            onLiveQueryChange={setLiveQuery}
            onDraftQueryChange={setDraftQuery}
            onCommitDraftChip={commitDraftChip}
            onRemoveChip={removeChip}
            onPhaseFilterChange={setPhaseFilter}
            onToggleSourceVisibility={toggleSourceVisibility}
            onReset={resetBuildControls}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedOverview" draggablePanels={draggablePanels}>
          <OverviewPanel
            selectedComp={selectedComp}
            selectedBuildPhase={selectedBuildPhase}
            copyState={copyState}
            onCopyTeamCode={copySelectedTeamCode}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedBoard" draggablePanels={draggablePanels}>
          <BoardViewPanel
            selectedComp={selectedComp}
            dataset={data}
            selectedBuildPhase={selectedBuildPhase}
            onHoverChampion={(id) => setLiveInspector(id ? { kind: "champion", id } : null)}
            onHoverItem={(id) => setLiveInspector(id ? { kind: "item", id } : null)}
            onToggleLock={toggleInspectorLock}
            onQuickFilter={addChip}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedSynergies" draggablePanels={draggablePanels}>
          <SynergiesPanel
            selectedComp={selectedComp}
            dataset={data}
            selectedBuildPhase={selectedBuildPhase}
            onHoverSynergy={(id) => setLiveInspector(id ? { kind: "synergy", id } : null)}
            onToggleLock={toggleInspectorLock}
            onQuickFilter={addChip}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel
          id="selectedAugments"
          draggablePanels={draggablePanels}
        >
          <RecommendedAugmentsPanel
            selectedComp={selectedComp}
            dataset={data}
            onHoverAugment={(id) => setLiveInspector(id ? { kind: "augment", id } : null)}
            onToggleLock={toggleInspectorLock}
            onQuickFilter={addChip}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedGamePlan" draggablePanels={draggablePanels}>
          <GamePlanPanel selectedComp={selectedComp} selectedBuildPhase={selectedBuildPhase} />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedComponents" draggablePanels={draggablePanels}>
          <ComponentsPanel
            selectedComp={selectedComp}
            dataset={data}
            selectedBuildPhase={selectedBuildPhase}
            onHoverItem={(id) => setLiveInspector(id ? { kind: "item", id } : null)}
            onToggleLock={toggleInspectorLock}
            onQuickFilter={addChip}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedSimilarities" draggablePanels={draggablePanels}>
          <SimilaritiesPanel
            dataset={data}
            selection={similaritySelection}
            selectedBuildPhase={selectedBuildPhase}
            onSelectionChange={setSimilaritySelection}
          />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="selectedGuide" draggablePanels={draggablePanels}>
          <LevellingGuidePanel selectedComp={selectedComp} selectedBuildPhase={selectedBuildPhase} />
        </DotTestDraggablePanel>

        <DotTestDraggablePanel id="inspector" draggablePanels={draggablePanels}>
          <InspectorPanel activeInspector={activeInspector} lockedInspector={lockedInspector} />
        </DotTestDraggablePanel>
      </section>

      {menuOpen ? (
        <div className="aptos-menu-panel dot-test-menu-panel is-open" role="menu" aria-label="OPNR menu">
          <button
            type="button"
            className="aptos-menu-link glitch-hover"
            aria-label="Comps"
            onClick={() => {
              window.location.assign("/");
            }}
          >
            <DecodingMenuText label="[ Comps ]" />
          </button>
          <button
            type="button"
            className="aptos-menu-link glitch-hover"
            aria-label="Similarity"
            onClick={() => {
              window.location.assign("/");
            }}
          >
            <DecodingMenuText label="[ Similarity ]" delay={80} />
          </button>
          <button
            type="button"
            className="aptos-menu-link glitch-hover"
            aria-label="Reset layout"
            onClick={() => {
              draggablePanels.resetPanelLayout();
              window.dispatchEvent(new Event("pointerleave"));
              setMenuOpen(false);
            }}
          >
            <DecodingMenuText label="[ Reset Layout ]" delay={160} />
          </button>
        </div>
      ) : null}

    </main>
  );
}

function DecodingMenuText({ label, delay = 0 }: { label: string; delay?: number }) {
  const [visibleText, setVisibleText] = useState(() => getEncodedText(label, 0));

  useEffect(() => {
    let frame = 0;
    let startTime = 0;
    const duration = 520;

    const tick = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp + delay;
      }

      const progress = clamp((timestamp - startTime) / duration, 0, 1);
      const revealedCount = Math.floor(progress * (label.length + 1));
      setVisibleText(getEncodedText(label, revealedCount));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [delay, label]);

  return <span className="decode-menu-text">{visibleText}</span>;
}

type DotTestDraggablePanelProps = {
  id: DraggablePanelId;
  label?: string;
  title?: string;
  draggablePanels: ReturnType<typeof useDraggablePanels>;
  children: ReactNode;
};

function DotTestDraggablePanel({ id, label, title, draggablePanels, children }: DotTestDraggablePanelProps) {
  const panel = PANEL_REGISTRY[id];
  const panelLabel = label ?? panel.label;
  const panelTitle = title ?? panel.title;
  const panelProps = draggablePanels.getPanelProps(id);
  const { className: panelStateClass, ...panelRest } = panelProps;
  const dragHandle = draggablePanels.getDragSurfaceProps(id, panelLabel);
  const collapsed = draggablePanels.isPanelCollapsed(id);
  const resizeHandles = getPanelResizeHandles(draggablePanels, id, panelLabel);

  return (
    <section
      className={`aptos-lab-panel dot-test-detail-panel dot-test-panel-${id} ${panelStateClass}`}
      aria-label={panelTitle}
      {...panelRest}
    >
      <div {...dragHandle} className={`${dragHandle.className} aptos-panel-header dot-test-detail-drag-bar`}>
        <span>{panelTitle}</span>
        <span className="dot-test-drag-label">[ Drag ]</span>
        <PanelCollapseButton
          collapsed={collapsed}
          label={panelLabel}
          onClick={() => draggablePanels.togglePanelCollapsed(id)}
        />
      </div>
      <div className="dot-test-detail-body" hidden={collapsed}>
        {children}
      </div>
      {collapsed ? null : resizeHandles}
    </section>
  );
}

function PanelCollapseButton({
  collapsed,
  label,
  onClick
}: {
  collapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  const action = collapsed ? "Expand" : "Collapse";

  return (
    <button
      type="button"
      className="dot-test-panel-collapse-button glitch-hover"
      aria-label={`${action} ${label} panel`}
      aria-expanded={!collapsed}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {collapsed ? "[ + ]" : "[ - ]"}
    </button>
  );
}

function getPanelResizeHandles(
  draggablePanels: ReturnType<typeof useDraggablePanels>,
  id: DraggablePanelId,
  label: string
) {
  return (
    <>
      <button {...draggablePanels.getResizeHandleProps(id, label, "left")} aria-hidden="true" tabIndex={-1} />
      <button {...draggablePanels.getResizeHandleProps(id, label, "right")} aria-hidden="true" tabIndex={-1} />
      <button {...draggablePanels.getResizeHandleProps(id, label, "top")} aria-hidden="true" tabIndex={-1} />
      <button {...draggablePanels.getResizeHandleProps(id, label, "bottom")} aria-hidden="true" tabIndex={-1} />
      <button {...draggablePanels.getResizeHandleProps(id, label, "corner")} />
    </>
  );
}

function EmptyPanelState({ label = "Select a build" }: { label?: string }) {
  return (
    <div className="dot-test-empty-panel">
      <span>[ Empty ]</span>
      <strong>{label}</strong>
    </div>
  );
}

type SourceOption = {
  key: string;
  label: string;
  abbreviation: string;
};

function BuildBrowserPhaseSelector({
  selectedBuildPhase,
  onSelectedBuildPhaseChange
}: {
  selectedBuildPhase: PhaseKey;
  onSelectedBuildPhaseChange: (value: PhaseKey) => void;
}) {
  return (
    <div className="dot-test-browser-phase-control" role="group" aria-label="Build phase">
      <span>Build Phase</span>
      <div className="dot-test-browser-phase-buttons">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            className={phase === selectedBuildPhase ? "dot-test-segment active" : "dot-test-segment"}
            onClick={() => onSelectedBuildPhaseChange(phase)}
          >
            {phase}
          </button>
        ))}
      </div>
    </div>
  );
}

type BuildControlsPanelProps = {
  data: Dataset | null;
  filteredCount: number;
  chips: string[];
  liveQuery: string;
  draftQuery: string;
  phaseFilter: PhaseFilter;
  sourceOptions: SourceOption[];
  hiddenSourceKeys: string[];
  onLiveQueryChange: (value: string) => void;
  onDraftQueryChange: (value: string) => void;
  onCommitDraftChip: () => void;
  onRemoveChip: (value: string) => void;
  onPhaseFilterChange: (value: PhaseFilter) => void;
  onToggleSourceVisibility: (sourceKey: string) => void;
  onReset: () => void;
};

function BuildControlsPanel({
  data,
  filteredCount,
  chips,
  liveQuery,
  draftQuery,
  phaseFilter,
  sourceOptions,
  hiddenSourceKeys,
  onLiveQueryChange,
  onDraftQueryChange,
  onCommitDraftChip,
  onRemoveChip,
  onPhaseFilterChange,
  onToggleSourceVisibility,
  onReset
}: BuildControlsPanelProps) {
  return (
    <div className="dot-test-controls-grid">
      <div className="dot-test-readout-row">
        <span>
          Visible
          <strong>{data ? `${filteredCount}/${data.comps.length}` : "--"}</strong>
        </span>
        <span>
          Filters
          <strong>{chips.length ? chips.length : "none"}</strong>
        </span>
      </div>

      <label className="dot-test-search-box">
        <span>Search</span>
        <input
          value={draftQuery}
          placeholder={chips.length ? "add filter" : "champion, trait, augment"}
          onChange={(event) => {
            onDraftQueryChange(event.target.value);
            onLiveQueryChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              onCommitDraftChip();
            } else if (event.key === "Backspace" && !draftQuery && chips.length > 0) {
              onRemoveChip(chips[chips.length - 1]);
            }
          }}
        />
      </label>

      <div className="dot-test-chip-rack" aria-label="Active filters">
        {chips.length ? (
          chips.map((chip) => (
            <button key={chip} type="button" className="dot-test-filter-chip" onClick={() => onRemoveChip(chip)}>
              [{chip}]
            </button>
          ))
        ) : (
          <span className="dot-test-muted-line">[ no filters ]</span>
        )}
      </div>

      <div className="dot-test-control-block">
        <span className="dot-test-control-label">List Phase</span>
        <div className="dot-test-segment-row">
          {PHASE_FILTER_OPTIONS.map((phase) => (
            <button
              key={phase}
              type="button"
              className={phase === phaseFilter ? "dot-test-segment active" : "dot-test-segment"}
              onClick={() => onPhaseFilterChange(phase)}
            >
              {phase}
            </button>
          ))}
        </div>
      </div>

      <div className="dot-test-source-stack" role="group" aria-label="Source visibility">
        {sourceOptions.map((source) => {
          const hidden = hiddenSourceKeys.includes(source.key);
          return (
            <button
              key={source.key}
              type="button"
              className={hidden ? "dot-test-source-toggle is-hidden" : "dot-test-source-toggle"}
              onClick={() => onToggleSourceVisibility(source.key)}
            >
              <strong>{source.label}</strong>
            </button>
          );
        })}
      </div>

      <button type="button" className="dot-test-reset-button glitch-hover" onClick={onReset}>
        [ Reset Filters ]
      </button>
    </div>
  );
}

function getGuideSection(comp: Comp, title: string) {
  const normalizedTitle = title.toLowerCase();
  return comp.guide.overview.find((section) => section.title.toLowerCase() === normalizedTitle) ?? null;
}

function getSourceReadout(comp: Comp) {
  const source = comp.sources[0];
  const sourceName = source?.name ?? "source";
  return {
    source,
    sourceName,
    sourceLabel: getSourceDisplayName(sourceName),
    sourceCode: getSourceAbbreviation(sourceName)
  };
}

function withoutGuidePrefix(line: string) {
  return line
    .replace(/^(?:Primary unit|Source|Comfortable line):\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

function getUsefulProviderNote(comp: Comp) {
  const note = comp.notes?.trim();
  return note && !/provider build\.?$/i.test(note) ? note : null;
}

function OverviewPanel({
  selectedComp,
  selectedBuildPhase,
  copyState,
  onCopyTeamCode
}: {
  selectedComp: Comp | null;
  selectedBuildPhase: PhaseKey;
  copyState: "idle" | "copied" | "error";
  onCopyTeamCode: () => void;
}) {
  if (!selectedComp) {
    return <EmptyPanelState />;
  }

  const rankTags = getCompRankTags(selectedComp);
  const playstyle = getCompPlaystyle(selectedComp);
  const playstyleIcon = getPlaystyleIcon(playstyle);
  const playstyleLabel = getPlaystyleLabel(playstyle);
  const { source, sourceLabel, sourceCode } = getSourceReadout(selectedComp);
  const guideGroups = getDetailPanelGuideGroups(selectedComp, selectedBuildPhase);
  const generalInfo = guideGroups.overview.find((section) => section.title.toLowerCase() === "general info") ?? null;
  const whenToMake = getGuideSection(selectedComp, "When to make");
  const primaryUnit = generalInfo?.lines.find((line) => /^Primary unit:/i.test(line));
  const secondaryReadout = primaryUnit
    ? { label: "Primary", value: withoutGuidePrefix(primaryUnit) }
    : { label: "Augments", value: `${selectedComp.recommendedAugmentIds.length} recs` };
  const summaryLines =
    generalInfo?.lines.filter((line) => !/^Primary unit:/i.test(line) && !/^Source:/i.test(line)).slice(0, 1) ?? [];
  const comfortableLine = whenToMake?.lines.find((line) => /^Comfortable line:/i.test(line));
  const providerNote = getUsefulProviderNote(selectedComp);

  return (
    <div className="dot-test-overview-grid">
      <div className="dot-test-overview-title">
        <span>
          {sourceLabel}
          {source?.tier ? ` / ${source.tier.toUpperCase()} tier` : ""}
        </span>
        <h2>{getCompDisplayTitle(selectedComp)}</h2>
      </div>

      <div className="dot-test-rank-strip">
        {rankTags.length ? (
          rankTags.slice(0, 4).map((rank) => (
            <RankBadge key={rank.key} tier={rank.tier} label={rank.label} sourceShort={rank.sourceShort} />
          ))
        ) : (
          <span className="dot-test-muted-line">[ unranked ]</span>
        )}
      </div>

      <div className="dot-test-overview-readouts">
        <span>
          Source
          <strong>{sourceCode}</strong>
        </span>
        <span>
          {secondaryReadout.label}
          <strong>{secondaryReadout.value}</strong>
        </span>
        <span>
          Line
          <strong>{comfortableLine ? withoutGuidePrefix(comfortableLine) : playstyleLabel ?? "unknown"}</strong>
        </span>
      </div>

      {playstyleLabel ? (
        <span className="dot-test-style-readout" title={playstyle ?? undefined}>
          {playstyleIcon ? <img src={playstyleIcon} alt="" /> : null}
          {playstyleLabel}
        </span>
      ) : null}

      {summaryLines.length ? (
        <div className="dot-test-overview-section">
          <span>General info</span>
          {summaryLines.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
      ) : null}

      {providerNote ? (
        <div className="dot-test-overview-section compact">
          <span>Provider note</span>
          <p>{providerNote}</p>
        </div>
      ) : null}

      {selectedComp.teamCode ? (
        <div className="dot-test-team-code-readout" title={selectedComp.teamCode}>
          <span>Team code</span>
          <code>{selectedComp.teamCode}</code>
        </div>
      ) : null}

      <div className="dot-test-overview-actions">
        {selectedComp.teamCode ? (
          <button type="button" className="dot-test-action-button" onClick={onCopyTeamCode}>
            [{copyState === "copied" ? "Copied" : copyState === "error" ? "Copy Failed" : "Copy Code"}]
          </button>
        ) : null}
        <a href={selectedComp.sourceUrl} target="_blank" rel="noreferrer" className="dot-test-action-link">
          [ Source Link ]
        </a>
      </div>
    </div>
  );
}

function BoardViewPanel({
  selectedComp,
  dataset,
  selectedBuildPhase,
  onHoverChampion,
  onHoverItem,
  onToggleLock,
  onQuickFilter
}: {
  selectedComp: Comp | null;
  dataset: Dataset | null;
  selectedBuildPhase: PhaseKey;
  onHoverChampion: (id: string | null) => void;
  onHoverItem: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [hexSize, setHexSize] = useState(38);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateHexSize = () => {
      const rect = panel.getBoundingClientRect();
      const availableWidth = Math.max(0, rect.width - 14);
      const availableHeight = Math.max(0, rect.height - 38);
      const widthBound = availableWidth / 8.05;
      const heightBound = availableHeight / 3.42;
      setHexSize(Math.round(clamp(Math.min(widthBound / 0.8660254, heightBound), 24, 72)));
    };

    updateHexSize();
    const observer = new ResizeObserver(updateHexSize);
    observer.observe(panel);

    return () => observer.disconnect();
  }, [dataset, selectedComp]);

  if (!selectedComp || !dataset) {
    return <EmptyPanelState />;
  }

  const phase = selectedComp.phases[selectedBuildPhase];
  const filledBoardSlotCount = phase.boardSlots.filter((slot) => slot.championId).length;
  const boardCells = phase.boardSlots.map((slot, slotIndex) => {
    const row = Math.floor(slotIndex / 7);
    const column = slotIndex % 7;

    return {
      slot,
      row,
      column,
      style: {
        left:
          row % 2 === 1
            ? `calc(${column} * (var(--hex-width) + var(--hex-gap-x)) + (var(--hex-width) / 2) + (var(--hex-gap-x) / 2))`
            : `calc(${column} * (var(--hex-width) + var(--hex-gap-x)))`,
        top: `calc(${row} * ((var(--hex-height) * 0.75) + var(--hex-gap-y)))`
      } satisfies CSSProperties
    };
  });

  return (
    <div
      ref={panelRef}
      className="dot-test-board-panel"
      style={{ "--opnr-board-hex-height": `${hexSize}px` } as CSSProperties}
    >
      <div className="dot-test-board-meta">
        <span>{selectedBuildPhase} board</span>
        <strong>{filledBoardSlotCount} units</strong>
      </div>
      <div className="board-stage dot-test-board-stage">
        <div className="board-grid">
          {boardCells.map(({ slot, row, column, style }) => {
            const champion = slot.championId ? dataset.championsById[slot.championId] : undefined;
            const starLevel = champion ? slot.starLevel ?? phase.championLevels?.[champion.id] ?? 1 : 1;
            return (
              <div
                key={slot.index}
                className={champion ? "board-cell has-unit" : "board-cell"}
                data-board-coord={`R${row + 1}:C${column + 1}`}
                data-board-slot={slot.index}
                style={style}
              >
                {renderChampionTile(
                  slot.index,
                  champion,
                  slot.itemIds ?? [],
                  starLevel,
                  dataset,
                  onHoverChampion,
                  onHoverItem,
                  onToggleLock,
                  onQuickFilter
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SynergiesPanel({
  selectedComp,
  dataset,
  selectedBuildPhase,
  onHoverSynergy,
  onToggleLock,
  onQuickFilter
}: {
  selectedComp: Comp | null;
  dataset: Dataset | null;
  selectedBuildPhase: PhaseKey;
  onHoverSynergy: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
}) {
  if (!selectedComp || !dataset) {
    return <EmptyPanelState />;
  }

  const phase = selectedComp.phases[selectedBuildPhase];
  const synergyCounts = phase.championIds.reduce<Record<string, number>>((counts, championId) => {
    const champion = dataset.championsById[championId];
    for (const traitId of champion?.traitIds ?? []) {
      counts[traitId] = (counts[traitId] ?? 0) + 1;
    }

    return counts;
  }, {});

  if (!phase.synergyIds.length) {
    return <EmptyPanelState label="No synergies found" />;
  }

  return (
    <div className="dot-test-token-grid">
      {phase.synergyIds.map((synergyId) => {
        const synergy = dataset.synergiesById[synergyId];
        const displayName = synergy?.name ?? synergyId;
        return (
          <button
            key={synergyId}
            type="button"
            className="dot-test-token-button"
            title={`${displayName} - click to pin, right-click to filter`}
            onMouseEnter={() => onHoverSynergy(synergyId)}
            onMouseLeave={() => onHoverSynergy(null)}
            onClick={() => onToggleLock({ kind: "synergy", id: synergyId })}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onQuickFilter(displayName);
            }}
          >
            {synergy?.icon ? <img src={synergy.icon} alt={displayName} /> : <span className="dot-test-token-fallback" />}
            <span>{displayName}</span>
            <strong>{synergyCounts[synergyId] ?? 0}</strong>
          </button>
        );
      })}
    </div>
  );
}

function RecommendedAugmentsPanel({
  selectedComp,
  dataset,
  onHoverAugment,
  onToggleLock,
  onQuickFilter
}: {
  selectedComp: Comp | null;
  dataset: Dataset | null;
  onHoverAugment: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
}) {
  if (!selectedComp || !dataset) {
    return <EmptyPanelState />;
  }

  if (!selectedComp.recommendedAugmentIds.length) {
    return <EmptyPanelState label="No augment data" />;
  }

  return (
    <div className="dot-test-augment-panel">
      <div className="dot-test-board-meta dot-test-augment-meta">
        <span>augment read</span>
        <strong>{selectedComp.recommendedAugmentIds.length} recs</strong>
      </div>
      <div className="augment-grid dot-test-augment-grid">
        {selectedComp.recommendedAugmentIds.map((augmentId) =>
          renderAugment(dataset.augmentsById[augmentId], onHoverAugment, onToggleLock, onQuickFilter)
        )}
      </div>
    </div>
  );
}

function GamePlanPanel({ selectedComp, selectedBuildPhase }: { selectedComp: Comp | null; selectedBuildPhase: PhaseKey }) {
  if (!selectedComp) {
    return <EmptyPanelState />;
  }

  const { gamePlan } = getDetailPanelGuideGroups(selectedComp, selectedBuildPhase);
  const noteCount = gamePlan.reduce((count, section) => count + section.lines.length, 0);

  if (!noteCount) {
    return <EmptyPanelState label="No game plan notes" />;
  }

  return (
    <div className="dot-test-game-plan-panel">
      <div className="dot-test-board-meta dot-test-game-plan-meta">
        <span>{selectedBuildPhase} plan</span>
        <strong>{noteCount} notes</strong>
      </div>
      <div className="dot-test-guide-section-list">
        {gamePlan.map((section) => (
          <section key={`${selectedBuildPhase}-${section.title}`} className="dot-test-guide-section">
            <h3>{section.title}</h3>
            <div className="dot-test-guide-lines">
              {section.lines.map((line, index) => (
                <p key={`${section.title}-${index}-${line}`}>{line}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ComponentsPanel({
  selectedComp,
  dataset,
  selectedBuildPhase,
  onHoverItem,
  onToggleLock,
  onQuickFilter
}: {
  selectedComp: Comp | null;
  dataset: Dataset | null;
  selectedBuildPhase: PhaseKey;
  onHoverItem: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
}) {
  if (!selectedComp || !dataset) {
    return <EmptyPanelState />;
  }

  const completedItems = getCompletedItemRecipeGroups(selectedComp, dataset, selectedBuildPhase);

  if (!selectedComp.componentDemand.length && !completedItems.length) {
    return <EmptyPanelState label="No item data" />;
  }

  return (
    <div className="dot-test-components-panel">
      <div className="dot-test-board-meta dot-test-components-meta">
        <span>{selectedBuildPhase} item read</span>
        <strong>
          {selectedComp.componentDemand.length} comps / {completedItems.length} items
        </strong>
      </div>

      <div className="dot-test-item-section-list">
        {completedItems.length ? (
          <section className="dot-test-item-section dot-test-completed-item-section">
            <h3>Completed items</h3>
            <div className="dot-test-completed-item-grid">
              {completedItems.map(({ item, count, recipe }) => {
                const recipeLabel = recipe.length ? ` Recipe: ${recipe.map((component) => component.name).join(" + ")}` : "";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="dot-test-completed-item-card"
                    title={`${item.name} - click to pin, right-click to filter.${recipeLabel}`}
                    onMouseEnter={() => onHoverItem(item.id)}
                    onMouseLeave={() => onHoverItem(null)}
                    onClick={() => onToggleLock({ kind: "item", id: item.id })}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onQuickFilter(item.name);
                    }}
                  >
                    <span className="dot-test-item-token-main">
                      <img src={item.icon} alt={item.name} />
                      <span>{item.name}</span>
                      <strong>{count}</strong>
                    </span>
                    {recipe.length ? (
                      <span className="dot-test-item-recipe-row" aria-label={`${item.name} recipe`}>
                        {recipe.map((component, index) => (
                          <span key={`${component.id}-${index}`} className="dot-test-recipe-chip">
                            <img src={component.icon} alt="" aria-hidden="true" />
                            <span>{component.name}</span>
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedComp.componentDemand.length ? (
          <section className="dot-test-item-section dot-test-component-demand-section">
            <h3>Component demand</h3>
            <div className="dot-test-item-token-grid">
              {selectedComp.componentDemand.map((component) => (
                <button
                  key={component.componentId}
                  type="button"
                  className="dot-test-item-token"
                  title={`${component.count}x ${component.label}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onQuickFilter(component.label);
                  }}
                >
                  <img src={`${import.meta.env.BASE_URL}assets/items/${component.componentId}.png`} alt={component.label} />
                  <span>{component.label}</span>
                  <strong>{component.count}</strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getSimilaritySelectionCount(selection: SimilaritySelection) {
  return selection.championIds.length + selection.augmentIds.length + selection.itemIds.length + selection.componentIds.length;
}

function isSimilarityEntitySelected(selection: SimilaritySelection, kind: SimilarityEntityKind, id: string) {
  if (kind === "champion") {
    return selection.championIds.includes(id);
  }

  if (kind === "augment") {
    return selection.augmentIds.includes(id);
  }

  if (kind === "item") {
    return selection.itemIds.includes(id);
  }

  return selection.componentIds.includes(id);
}

function toggleSimilarityId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function removeOneSimilarityId(values: string[], id: string) {
  const index = values.lastIndexOf(id);
  if (index === -1) {
    return values;
  }

  return [...values.slice(0, index), ...values.slice(index + 1)];
}

function getSimilarityEntitySections(dataset: Dataset): { title: string; kind: SimilarityEntityKind; options: SimilarityEntityOption[] }[] {
  const champions = Object.values(dataset.championsById)
    .filter((champion) => champion.cost <= 5)
    .sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name))
    .map((champion) => ({
      kind: "champion" as const,
      id: champion.id,
      name: champion.name,
      icon: champion.icon,
      meta: `${champion.cost}C`
    }));
  const augments = Object.values(dataset.augmentsById)
    .sort((left, right) => {
      const leftTier = SIMILARITY_AUGMENT_TIER_ORDER[left.tier] ?? SIMILARITY_AUGMENT_TIER_ORDER.Unknown;
      const rightTier = SIMILARITY_AUGMENT_TIER_ORDER[right.tier] ?? SIMILARITY_AUGMENT_TIER_ORDER.Unknown;
      return leftTier - rightTier || left.name.localeCompare(right.name);
    })
    .map((augment) => ({
      kind: "augment" as const,
      id: augment.id,
      name: augment.name,
      icon: augment.icon,
      meta: augment.tier === "Unknown" ? undefined : augment.tier
    }));
  const items = Object.values(dataset.itemsById)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      kind: "item" as const,
      id: item.id,
      name: item.name,
      icon: item.icon
    }));
  const components = Object.entries(COMPONENT_LABELS).map(([componentId, label]) => ({
    kind: "component" as const,
    id: componentId,
    name: label,
    icon: `${import.meta.env.BASE_URL}assets/items/${componentId}.png`
  }));

  return [
    { title: "Champions", kind: "champion", options: champions },
    { title: "Augments", kind: "augment", options: augments },
    { title: "Items", kind: "item", options: items },
    { title: "Components", kind: "component", options: components }
  ];
}

function SimilaritiesPanel({
  dataset,
  selection,
  selectedBuildPhase,
  onSelectionChange
}: {
  dataset: Dataset | null;
  selection: SimilaritySelection;
  selectedBuildPhase: PhaseKey;
  onSelectionChange: (selection: SimilaritySelection) => void;
}) {
  const [pickerQuery, setPickerQuery] = useState("");

  if (!dataset) {
    return <EmptyPanelState label="Dataset unavailable" />;
  }

  const selectedCount = getSimilaritySelectionCount(selection);
  const normalizedQuery = pickerQuery.trim().toLowerCase();
  const sections = getSimilarityEntitySections(dataset).map((section) => ({
    ...section,
    options: normalizedQuery
      ? section.options.filter((option) => option.name.toLowerCase().includes(normalizedQuery) || option.id.includes(normalizedQuery))
      : section.options
  }));

  const toggleEntity = (kind: SimilarityEntityKind, id: string) => {
    if (kind === "champion") {
      onSelectionChange({ ...selection, championIds: toggleSimilarityId(selection.championIds, id) });
      return;
    }

    if (kind === "augment") {
      onSelectionChange({ ...selection, augmentIds: toggleSimilarityId(selection.augmentIds, id) });
      return;
    }

    if (kind === "item") {
      onSelectionChange({ ...selection, itemIds: toggleSimilarityId(selection.itemIds, id) });
      return;
    }

    onSelectionChange({ ...selection, componentIds: [...selection.componentIds, id] });
  };

  const removeComponent = (id: string) => {
    onSelectionChange({ ...selection, componentIds: removeOneSimilarityId(selection.componentIds, id) });
  };

  return (
    <div className="dot-test-similarities-panel dot-test-similarity-filter-panel">
      <div className="dot-test-board-meta dot-test-similarity-meta">
        <span>{selectedBuildPhase} similarity filter</span>
        <strong>{selectedCount} selected</strong>
      </div>

      <div className="dot-test-similarity-filter-controls">
        <input
          className="dot-test-similarity-search"
          aria-label="Search similarity filter options"
          placeholder="Find champion, item, augment..."
          value={pickerQuery}
          onChange={(event) => setPickerQuery(event.target.value)}
        />
        <button type="button" className="dot-test-similarity-clear" onClick={() => onSelectionChange(EMPTY_SIMILARITY_SELECTION)}>
          [ Clear ]
        </button>
      </div>

      <div className="dot-test-similarity-picker-sections">
        {sections.map((section) => (
          <section key={section.kind} className="dot-test-similarity-picker-section">
            <div className="dot-test-similarity-picker-heading">
              <h3>{section.title}</h3>
              <span>{section.options.length}</span>
            </div>
            <div className="dot-test-similarity-picker-grid">
              {section.options.map((option) => {
                const selected = isSimilarityEntitySelected(selection, option.kind, option.id);
                const componentCount =
                  option.kind === "component" ? selection.componentIds.filter((id) => id === option.id).length : 0;
                const badge = option.kind === "component" && componentCount > 0 ? String(componentCount) : option.meta;

                return (
                  <button
                    key={`${option.kind}-${option.id}`}
                    type="button"
                    className={selected ? "dot-test-similarity-pick selected" : "dot-test-similarity-pick"}
                    aria-label={`Toggle ${option.kind} ${option.name}`}
                    title={
                      option.kind === "component"
                        ? `${option.name} - left-click adds one, right-click removes one`
                        : option.name
                    }
                    onClick={() => toggleEntity(option.kind, option.id)}
                    onContextMenu={(event) => {
                      if (option.kind !== "component") {
                        return;
                      }

                      event.preventDefault();
                      removeComponent(option.id);
                    }}
                  >
                    <img src={option.icon} alt="" aria-hidden="true" />
                    {badge ? <span>{badge}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function LevellingGuidePanel({ selectedComp, selectedBuildPhase }: { selectedComp: Comp | null; selectedBuildPhase: PhaseKey }) {
  if (!selectedComp) {
    return <EmptyPanelState />;
  }

  const section = getLevellingGuideSection(selectedComp, selectedBuildPhase);
  if (!section) {
    return <EmptyPanelState label="No levelling notes" />;
  }

  return <LevellingGuideContent section={section} className="dot-test-level-guide" />;
}

function InspectorPanel({
  activeInspector,
  lockedInspector
}: {
  activeInspector: ReturnType<typeof buildInspectorModel>;
  lockedInspector: InspectorTarget;
}) {
  if (!activeInspector) {
    return (
      <div className="inspector-card detail-full-inspector is-empty dot-test-inspector-card">
        <div className="section-header">
          <h3>target read</h3>
          <p>[ idle ]</p>
        </div>
        <p className="quiet-copy">Hover a unit, item, augment, or synergy. Click the same target again to unpin it.</p>
      </div>
    );
  }

  return (
    <div className="inspector-card detail-full-inspector has-inspector dot-test-inspector-card">
      <div className="section-header">
        <h3>{activeInspector.accent}</h3>
        <p>{lockedInspector ? "[ pinned ]" : "[ live ]"}</p>
      </div>
      <div className="inspector-body">
        <div className="inspector-head">
          <img src={activeInspector.icon} alt={activeInspector.title} className="inspector-icon" />
          <div className="inspector-copy">
            <div className="inspector-meta-row">
              <span className="accent-pill">{activeInspector.accent}</span>
              {activeInspector.chips.length > 0 ? (
                <div className="mini-chip-row wrap">
                  {activeInspector.chips.map((chip) => (
                    <span key={chip.key} className={chip.icon ? "mini-chip muted with-icon" : "mini-chip muted"}>
                      {chip.icon ? (
                        <span
                          className="mini-chip-icon"
                          style={{ "--mini-chip-icon": `url(${chip.icon})` } as CSSProperties}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{chip.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <h4 data-testid="inspector-title">{activeInspector.title}</h4>
            {activeInspector.subtitle ? <p className="inspector-subtitle">{activeInspector.subtitle}</p> : null}
          </div>
        </div>
        <div className="inspector-content">
          {activeInspector.unlockCondition ? (
            <div className="unlock-callout">
              <img src={`${import.meta.env.BASE_URL}assets/system/lock.svg`} alt="" className="unlock-callout-icon" />
              <div>
                <p className="unlock-callout-label">Unlock before purchase</p>
                <p className="unlock-callout-copy">{activeInspector.unlockCondition}</p>
              </div>
            </div>
          ) : null}
          {activeInspector.recommendedItems?.length ? (
            <div className="inspector-section">
              <h5>Recommended items</h5>
              <div className="inspector-item-grid">
                {activeInspector.recommendedItems.map((item) => (
                  <div key={item.id} className="inspector-item-card">
                    <img src={item.icon} alt={item.name} className="inspector-item-icon" />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {activeInspector.recipe?.length ? (
            <div className="inspector-section">
              <h5>Recipe</h5>
              <div className="recipe-row">
                {activeInspector.recipe.map((component, index) => (
                  <div key={`${component.id}-${index}`} className="recipe-component-wrap">
                    {index > 0 ? (
                      <span className="recipe-plus" aria-hidden="true">
                        +
                      </span>
                    ) : null}
                    <span className="recipe-component" aria-label={`Recipe component ${component.name}`}>
                      <img src={component.icon} alt={component.name} className="recipe-icon" />
                      <span>{component.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="inspector-body-copy">{activeInspector.body}</p>
        </div>
      </div>
    </div>
  );
}
