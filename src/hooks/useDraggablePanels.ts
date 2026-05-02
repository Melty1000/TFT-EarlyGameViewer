import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent
} from "react";
import {
  PANEL_IDS,
  getDefaultResizeAnchors,
  type DraggablePanelId,
  type PanelResizeAnchors as ResizeAnchors
} from "../lib/panelRegistry";

export type { DraggablePanelId } from "../lib/panelRegistry";
export { getDefaultResizeAnchors } from "../lib/panelRegistry";
export type PanelOffset = { x: number; y: number };
export type PanelLayoutEntry = PanelOffset & { width?: number; height?: number };
export type PanelLayout = Record<DraggablePanelId, PanelLayoutEntry>;
export type ResizeHandle = "left" | "right" | "top" | "bottom" | "corner";

const PANEL_STORAGE_KEY = "opnr:aptos-panel-layout:v1";
const PANEL_LIVE_LAYOUT_EVENT = "opnr:aptos-panel-live-layout";
const PANEL_DRAG_SURFACE_SELECTOR = "[data-panel-drag-surface]";
const PANEL_COLLAPSE_BUTTON_SELECTOR = ".dot-test-panel-collapse-button, .aptos-panel-collapse-button";
const PANEL_CHROME_CONTROL_SELECTOR = [
  PANEL_DRAG_SURFACE_SELECTOR,
  PANEL_COLLAPSE_BUTTON_SELECTOR,
  ".dot-test-resize-handle"
].join(", ");
const DEFAULT_LAYOUT = PANEL_IDS.reduce<PanelLayout>((layout, id) => {
  layout[id] = { x: 0, y: 0 };
  return layout;
}, {} as PanelLayout);

type DragState = {
  id: DraggablePanelId;
  pointerId: number | null;
  startX: number;
  startY: number;
  origin: PanelOffset;
  panelRect: PanelRect;
  panel: HTMLElement;
  currentOffset: PanelOffset;
  frame: number | null;
  lastTime: number;
  velocityX: number;
  velocityY: number;
  released: boolean;
};

type ResizeState = {
  id: DraggablePanelId;
  handle: ResizeHandle;
  anchoredRight: boolean;
  anchoredBottom: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  origin: PanelLayoutEntry;
  panelRect: PanelRect;
  panel: HTMLElement;
  currentLayout: PanelLayoutEntry;
  frame: number | null;
};

type PanelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type PanelChromeHit = {
  id: DraggablePanelId;
  panel: HTMLElement;
  dragSurface: HTMLElement;
};

type PanelResizeHit = {
  id: DraggablePanelId;
  panel: HTMLElement;
  handle: ResizeHandle;
  resizeHandle: HTMLElement;
};

function isPanelId(value: string): value is DraggablePanelId {
  return PANEL_IDS.includes(value as DraggablePanelId);
}

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element;
}

function containsPoint(rect: DOMRect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isUsableElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function getPanelDragSurface(panel: HTMLElement, id: DraggablePanelId) {
  return (
    panel.querySelector<HTMLElement>(`[data-panel-drag-surface="${id}"]`) ??
    panel.querySelector<HTMLElement>(PANEL_DRAG_SURFACE_SELECTOR)
  );
}

function getResizeHandleFromElement(element: Element): ResizeHandle | null {
  if (element.classList.contains("dot-test-resize-left")) {
    return "left";
  }

  if (element.classList.contains("dot-test-resize-right")) {
    return "right";
  }

  if (element.classList.contains("dot-test-resize-top")) {
    return "top";
  }

  if (element.classList.contains("dot-test-resize-bottom")) {
    return "bottom";
  }

  return element.classList.contains("dot-test-resize-corner") ? "corner" : null;
}

function findPanelResizeHit(
  panelRefs: Map<DraggablePanelId, HTMLElement>,
  clientX: number,
  clientY: number,
  target: EventTarget | null
): PanelResizeHit | null {
  const targetElement = isElement(target) ? target : null;

  if (targetElement?.closest(".dot-test-resize-handle")) {
    return null;
  }

  const candidates: PanelResizeHit[] = [];

  for (const id of PANEL_IDS) {
    const panel = panelRefs.get(id);

    if (!panel || !isUsableElement(panel)) {
      continue;
    }

    for (const resizeHandle of Array.from(panel.querySelectorAll<HTMLElement>(".dot-test-resize-handle"))) {
      if (!isUsableElement(resizeHandle) || !containsPoint(resizeHandle.getBoundingClientRect(), clientX, clientY)) {
        continue;
      }

      const handle = getResizeHandleFromElement(resizeHandle);

      if (handle) {
        candidates.push({ id, panel, handle, resizeHandle });
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  const stackedElements =
    typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(clientX, clientY) : [];

  for (const element of stackedElements) {
    const stackedResizeHandle = element.closest(".dot-test-resize-handle");

    if (!stackedResizeHandle) {
      continue;
    }

    const stackedCandidate = candidates.find((candidate) => candidate.resizeHandle === stackedResizeHandle);

    if (stackedCandidate) {
      return stackedCandidate;
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

function findPanelChromeHit(
  panelRefs: Map<DraggablePanelId, HTMLElement>,
  clientX: number,
  clientY: number,
  target: EventTarget | null
): PanelChromeHit | null {
  const targetElement = isElement(target) ? target : null;

  if (targetElement?.closest(PANEL_CHROME_CONTROL_SELECTOR)) {
    return null;
  }

  const candidates: PanelChromeHit[] = [];

  for (const id of PANEL_IDS) {
    const panel = panelRefs.get(id);

    if (!panel || !isUsableElement(panel)) {
      continue;
    }

    const dragSurface = getPanelDragSurface(panel, id);

    if (!dragSurface || !isUsableElement(dragSurface) || !containsPoint(dragSurface.getBoundingClientRect(), clientX, clientY)) {
      continue;
    }

    candidates.push({ id, panel, dragSurface });
  }

  if (!candidates.length) {
    return null;
  }

  const stackedElements =
    typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(clientX, clientY) : [];

  for (const element of stackedElements) {
    if (!(element instanceof Element)) {
      continue;
    }

    const stackedDragSurface = element.closest(PANEL_DRAG_SURFACE_SELECTOR);

    if (!stackedDragSurface) {
      continue;
    }

    const stackedCandidate = candidates.find((candidate) => candidate.dragSurface === stackedDragSurface);

    if (stackedCandidate) {
      return stackedCandidate;
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

function normalizeLayout(value: unknown): PanelLayout {
  if (!value || typeof value !== "object") {
    return DEFAULT_LAYOUT;
  }

  return PANEL_IDS.reduce<PanelLayout>((layout, id) => {
    const candidate = (value as Partial<Record<DraggablePanelId, Partial<PanelLayoutEntry>>>)[id];
    layout[id] = {
      x: typeof candidate?.x === "number" ? candidate.x : 0,
      y: typeof candidate?.y === "number" ? candidate.y : 0,
      ...(typeof candidate?.width === "number" && candidate.width > 0 ? { width: Math.round(candidate.width) } : {}),
      ...(typeof candidate?.height === "number" && candidate.height > 0 ? { height: Math.round(candidate.height) } : {})
    };
    return layout;
  }, { ...DEFAULT_LAYOUT });
}

function getStoredLayout(): PanelLayout {
  if (typeof window === "undefined") {
    return DEFAULT_LAYOUT;
  }

  try {
    return normalizeLayout(JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const DRAG_VIEWPORT_PADDING = 0;
const DRAG_TOP_SAFE_Y = 42;
const INERTIA_MIN_SPEED = 0.14;
const INERTIA_STOP_SPEED = 0.018;
const INERTIA_FRICTION = 0.958;
const INERTIA_BOUNCE = 0.42;
const INERTIA_MAX_SPEED = 2.8;
const RESIZE_VIEWPORT_PADDING = 0;
const RESIZE_TOP_SAFE_Y = 42;
const MIN_PANEL_WIDTH = 210;
const MIN_PANEL_HEIGHT = 132;
const COLLAPSED_PANEL_HEIGHT = 38;
const RECOVERY_VISIBLE_EDGE = 56;

function getPanelFromHandle(handle: HTMLElement) {
  return handle.closest<HTMLElement>("[data-panel-id]") ?? handle;
}

function getPanelRect(panel: HTMLElement): PanelRect {
  const rect = panel.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function setPanelTransform(panel: HTMLElement, offset: PanelOffset) {
  panel.style.transform = offset.x || offset.y ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : "";
}

function reportLivePanelLayout(panel: HTMLElement, layout: PanelLayoutEntry) {
  const id = panel.dataset.panelId;
  if (!id || !isPanelId(id)) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(PANEL_LIVE_LAYOUT_EVENT, {
      detail: { id, layout }
    })
  );
}

function setPanelSize(panel: HTMLElement, layout: PanelLayoutEntry) {
  panel.style.width = layout.width ? `${layout.width}px` : "";
  panel.style.height = layout.height ? `${layout.height}px` : "";
  reportLivePanelLayout(panel, layout);
}

function getCssAnchorValue(panel: HTMLElement, id: DraggablePanelId, edge: "left" | "right" | "top" | "bottom") {
  return window.getComputedStyle(panel).getPropertyValue(`--opnr-debug-${id}-${edge}`).trim();
}

function isAutoAnchorValue(value: string) {
  return value === "" || value.toLowerCase() === "auto";
}

function getResizeAnchors(panel: HTMLElement, id: DraggablePanelId): ResizeAnchors {
  if (typeof window === "undefined") {
    return getDefaultResizeAnchors(id);
  }

  const left = getCssAnchorValue(panel, id, "left");
  const right = getCssAnchorValue(panel, id, "right");
  const top = getCssAnchorValue(panel, id, "top");
  const bottom = getCssAnchorValue(panel, id, "bottom");

  return {
    right: left || right ? isAutoAnchorValue(left) && !isAutoAnchorValue(right) : getDefaultResizeAnchors(id).right,
    bottom: top || bottom ? isAutoAnchorValue(top) && !isAutoAnchorValue(bottom) : getDefaultResizeAnchors(id).bottom
  };
}

function getOffsetBounds(origin: PanelOffset, panelRect: PanelRect) {
  if (typeof window === "undefined") {
    return {
      minX: Number.NEGATIVE_INFINITY,
      maxX: Number.POSITIVE_INFINITY,
      minY: Number.NEGATIVE_INFINITY,
      maxY: Number.POSITIVE_INFINITY
    };
  }

  let minX = origin.x + DRAG_VIEWPORT_PADDING - panelRect.left;
  let maxX = origin.x + window.innerWidth - DRAG_VIEWPORT_PADDING - panelRect.right;
  let minY = origin.y + DRAG_TOP_SAFE_Y - panelRect.top;
  let maxY = origin.y + window.innerHeight - DRAG_VIEWPORT_PADDING - panelRect.bottom;

  if (minX > maxX) {
    const center = (minX + maxX) / 2;
    minX = center;
    maxX = center;
  }

  if (minY > maxY) {
    const center = (minY + maxY) / 2;
    minY = center;
    maxY = center;
  }

  return { minX, maxX, minY, maxY };
}

function clampVelocity(value: number) {
  return Math.min(Math.max(value, -INERTIA_MAX_SPEED), INERTIA_MAX_SPEED);
}

function clampDragOffset(origin: PanelOffset, panelRect: PanelRect, deltaX: number, deltaY: number): PanelOffset {
  if (typeof window === "undefined") {
    return {
      x: Math.round(origin.x + deltaX),
      y: Math.round(origin.y + deltaY)
    };
  }

  let clampedDeltaX = deltaX;
  let clampedDeltaY = deltaY;
  const minLeft = DRAG_VIEWPORT_PADDING;
  const minTop = DRAG_TOP_SAFE_Y;
  const maxRight = window.innerWidth - DRAG_VIEWPORT_PADDING;
  const maxBottom = window.innerHeight - DRAG_VIEWPORT_PADDING;

  if (panelRect.left + clampedDeltaX < minLeft) {
    clampedDeltaX = minLeft - panelRect.left;
  }

  if (panelRect.right + clampedDeltaX > maxRight) {
    clampedDeltaX = maxRight - panelRect.right;
  }

  if (panelRect.top + clampedDeltaY < minTop) {
    clampedDeltaY = minTop - panelRect.top;
  }

  if (panelRect.bottom + clampedDeltaY > maxBottom) {
    clampedDeltaY = maxBottom - panelRect.bottom;
  }

  return {
    x: Math.round(origin.x + clampedDeltaX),
    y: Math.round(origin.y + clampedDeltaY)
  };
}

function getRecoveredOffset(current: PanelOffset, panelRect: PanelRect): PanelOffset | null {
  if (typeof window === "undefined") {
    return null;
  }

  const visibleX = Math.min(RECOVERY_VISIBLE_EDGE, Math.max(24, panelRect.width));
  const visibleY = Math.min(RECOVERY_VISIBLE_EDGE, Math.max(24, panelRect.height));
  let nextX = current.x;
  let nextY = current.y;

  if (panelRect.left > window.innerWidth - visibleX) {
    nextX += Math.round(window.innerWidth - visibleX - panelRect.left);
  } else if (panelRect.right < visibleX) {
    nextX += Math.round(visibleX - panelRect.right);
  }

  if (panelRect.top < DRAG_TOP_SAFE_Y) {
    nextY += Math.round(DRAG_TOP_SAFE_Y - panelRect.top);
  } else if (panelRect.top > window.innerHeight - visibleY) {
    nextY += Math.round(window.innerHeight - visibleY - panelRect.top);
  } else if (panelRect.bottom < visibleY) {
    nextY += Math.round(visibleY - panelRect.bottom);
  }

  return nextX === current.x && nextY === current.y ? null : { x: nextX, y: nextY };
}

function clampPanelSize(value: number, min: number, max: number) {
  const safeMax = Math.max(min, max);
  return Math.round(Math.min(Math.max(value, min), safeMax));
}

export function getResizeLayout(
  origin: PanelLayoutEntry,
  panelRect: PanelRect,
  handle: ResizeHandle,
  anchors: ResizeAnchors,
  deltaX: number,
  deltaY: number
) {
  const maxRight = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth - RESIZE_VIEWPORT_PADDING;
  const maxBottom = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerHeight - RESIZE_VIEWPORT_PADDING;
  const minLeft = RESIZE_VIEWPORT_PADDING;
  const minTop = RESIZE_TOP_SAFE_Y;
  const startWidth = origin.width ?? panelRect.width;
  const startHeight = origin.height ?? panelRect.height;

  let width = startWidth;
  let height = startHeight;
  let x = origin.x;
  let y = origin.y;

  if (handle === "right" || handle === "corner") {
    width = clampPanelSize(startWidth + deltaX, MIN_PANEL_WIDTH, maxRight - panelRect.left);
    if (anchors.right) {
      x = Math.round(origin.x + width - startWidth);
    }
  }

  if (handle === "bottom" || handle === "corner") {
    height = clampPanelSize(startHeight + deltaY, MIN_PANEL_HEIGHT, maxBottom - panelRect.top);
    if (anchors.bottom) {
      y = Math.round(origin.y + height - startHeight);
    }
  }

  if (handle === "left") {
    const nextLeft = Math.min(
      Math.max(panelRect.left + deltaX, minLeft),
      panelRect.right - MIN_PANEL_WIDTH
    );
    width = Math.round(panelRect.right - nextLeft);
    if (!anchors.right) {
      x = Math.round(origin.x + nextLeft - panelRect.left);
    }
  }

  if (handle === "top") {
    const nextTop = Math.min(
      Math.max(panelRect.top + deltaY, minTop),
      panelRect.bottom - MIN_PANEL_HEIGHT
    );
    height = Math.round(panelRect.bottom - nextTop);
    if (!anchors.bottom) {
      y = Math.round(origin.y + nextTop - panelRect.top);
    }
  }

  return {
    x,
    y,
    width,
    height
  };
}

function saveLayout(layout: PanelLayout) {
  window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(layout));
}

export function useDraggablePanels() {
  const [layout, setLayout] = useState<PanelLayout>(() => getStoredLayout());
  const [draggingId, setDraggingId] = useState<DraggablePanelId | null>(null);
  const [resizingId, setResizingId] = useState<DraggablePanelId | null>(null);
  const [focusedId, setFocusedId] = useState<DraggablePanelId | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<DraggablePanelId[]>([]);
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);
  const panelRefs = useRef(new Map<DraggablePanelId, HTMLElement>());
  const collapsedIdSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);

  const setPanelRef = useCallback((id: DraggablePanelId, panel: HTMLElement | null) => {
    if (panel) {
      panelRefs.current.set(id, panel);
      return;
    }

    panelRefs.current.delete(id);
  }, []);

  const setAndSaveLayout = useCallback((updater: (current: PanelLayout) => PanelLayout) => {
    setLayout((current) => {
      const next = updater(current);
      saveLayout(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const recoverPanels = () => {
      if (dragState.current || resizeState.current || typeof document === "undefined") {
        return;
      }

      setAndSaveLayout((current) => {
        let changed = false;
        const nextLayout = { ...current };

        for (const id of PANEL_IDS) {
          const panel = document.querySelector<HTMLElement>(`[data-panel-id="${id}"]`);
          if (!panel) {
            continue;
          }

          const recoveredOffset = getRecoveredOffset(current[id], getPanelRect(panel));
          if (!recoveredOffset) {
            continue;
          }

          nextLayout[id] = {
            ...current[id],
            ...recoveredOffset
          };
          changed = true;
        }

        return changed ? nextLayout : current;
      });
    };

    const frame = window.requestAnimationFrame(recoverPanels);
    window.addEventListener("resize", recoverPanels);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", recoverPanels);
    };
  }, [setAndSaveLayout]);

  useEffect(() => {
    if (!dragState.current) {
      return;
    }

    const finishMotion = (active: DragState) => {
      active.panel.style.willChange = "";
      dragState.current = null;
      setDraggingId(null);
      setAndSaveLayout((current) => ({
        ...current,
        [active.id]: {
          ...current[active.id],
          ...active.currentOffset
        }
      }));
    };

    const startInertia = (active: DragState) => {
      const releaseSpeed = Math.hypot(active.velocityX, active.velocityY);
      if (releaseSpeed < INERTIA_MIN_SPEED) {
        finishMotion(active);
        return;
      }

      active.velocityX = clampVelocity(active.velocityX);
      active.velocityY = clampVelocity(active.velocityY);
      active.lastTime = performance.now();

      const tick = (timestamp: number) => {
        if (dragState.current !== active) {
          return;
        }

        const elapsed = Math.min(Math.max(timestamp - active.lastTime, 8), 32);
        active.lastTime = timestamp;

        const friction = Math.pow(INERTIA_FRICTION, elapsed / 16.67);
        active.velocityX *= friction;
        active.velocityY *= friction;

        let nextX = active.currentOffset.x + active.velocityX * elapsed;
        let nextY = active.currentOffset.y + active.velocityY * elapsed;
        const bounds = getOffsetBounds(active.origin, active.panelRect);

        if (nextX < bounds.minX) {
          nextX = bounds.minX;
          active.velocityX = Math.abs(active.velocityX) * INERTIA_BOUNCE;
        } else if (nextX > bounds.maxX) {
          nextX = bounds.maxX;
          active.velocityX = -Math.abs(active.velocityX) * INERTIA_BOUNCE;
        }

        if (nextY < bounds.minY) {
          nextY = bounds.minY;
          active.velocityY = Math.abs(active.velocityY) * INERTIA_BOUNCE;
        } else if (nextY > bounds.maxY) {
          nextY = bounds.maxY;
          active.velocityY = -Math.abs(active.velocityY) * INERTIA_BOUNCE;
        }

        active.currentOffset = {
          x: Math.round(nextX),
          y: Math.round(nextY)
        };
        setPanelTransform(active.panel, active.currentOffset);

        if (Math.hypot(active.velocityX, active.velocityY) < INERTIA_STOP_SPEED) {
          active.frame = null;
          finishMotion(active);
          return;
        }

        active.frame = window.requestAnimationFrame(tick);
      };

      active.frame = window.requestAnimationFrame(tick);
    };

    const handleMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      const active = dragState.current;
      if (!active || active.released) {
        return;
      }

      const nextOffset = clampDragOffset(
        active.origin,
        active.panelRect,
        event.clientX - active.startX,
        event.clientY - active.startY
      );

      const timestamp = performance.now();
      const elapsed = Math.max(timestamp - active.lastTime, 8);
      const instantVelocityX = (nextOffset.x - active.currentOffset.x) / elapsed;
      const instantVelocityY = (nextOffset.y - active.currentOffset.y) / elapsed;
      active.velocityX = active.velocityX * 0.48 + instantVelocityX * 0.52;
      active.velocityY = active.velocityY * 0.48 + instantVelocityY * 0.52;
      active.currentOffset = nextOffset;
      active.lastTime = timestamp;

      if (active.frame === null) {
        active.frame = window.requestAnimationFrame(() => {
          const latest = dragState.current;
          if (!latest) {
            return;
          }

          latest.frame = null;
          setPanelTransform(latest.panel, latest.currentOffset);
        });
      }
    };

    const handleUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      const active = dragState.current;
      if (!active) {
        return;
      }

      if (active.pointerId !== null && "pointerId" in event && event.pointerId !== active.pointerId) {
        return;
      }

      if (active.frame !== null) {
        window.cancelAnimationFrame(active.frame);
        active.frame = null;
      }

      setPanelTransform(active.panel, active.currentOffset);
      active.released = true;
      startInertia(active);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      const active = dragState.current;
      if (active && active.frame !== null) {
        window.cancelAnimationFrame(active.frame);
      }

      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingId, setAndSaveLayout]);

  useEffect(() => {
    if (!resizeState.current) {
      return;
    }

    const finishResize = (active: ResizeState) => {
      if (active.frame !== null) {
        window.cancelAnimationFrame(active.frame);
      }

      active.panel.style.willChange = "";
      resizeState.current = null;
      setResizingId(null);
      setAndSaveLayout((current) => ({
        ...current,
        [active.id]: active.currentLayout
      }));
    };

    const handleMove = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      const active = resizeState.current;
      if (!active) {
        return;
      }

      const nextLayout = getResizeLayout(
        active.origin,
        active.panelRect,
        active.handle,
        {
          right: active.anchoredRight,
          bottom: active.anchoredBottom
        },
        event.clientX - active.startX,
        event.clientY - active.startY
      );
      active.currentLayout = nextLayout;

      if (active.frame === null) {
        active.frame = window.requestAnimationFrame(() => {
          const latest = resizeState.current;
          if (!latest) {
            return;
          }

          latest.frame = null;
          setPanelTransform(latest.panel, latest.currentLayout);
          setPanelSize(latest.panel, latest.currentLayout);
        });
      }
    };

    const handleUp = (event: globalThis.PointerEvent | globalThis.MouseEvent) => {
      const active = resizeState.current;
      if (!active) {
        return;
      }

      if (active.pointerId !== null && "pointerId" in event && event.pointerId !== active.pointerId) {
        return;
      }

      setPanelTransform(active.panel, active.currentLayout);
      setPanelSize(active.panel, active.currentLayout);
      finishResize(active);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);

    return () => {
      const active = resizeState.current;
      if (active && active.frame !== null) {
        window.cancelAnimationFrame(active.frame);
      }

      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizingId, setAndSaveLayout]);

  const getPanelProps = useCallback(
    (id: DraggablePanelId) => {
      const panelLayout = layout[id];
      const isCollapsed = collapsedIdSet.has(id);
      const style: CSSProperties = {};

      if (panelLayout.x || panelLayout.y) {
        style.transform = `translate3d(${panelLayout.x}px, ${panelLayout.y}px, 0)`;
      }

      if (panelLayout.width) {
        style.width = `${panelLayout.width}px`;
      }

      if (isCollapsed) {
        style.height = `${COLLAPSED_PANEL_HEIGHT}px`;
      } else if (panelLayout.height) {
        style.height = `${panelLayout.height}px`;
      }

      return {
        "data-testid": `aptos-panel-${id}`,
        "data-panel-id": id,
        "aria-expanded": !isCollapsed,
        ref: (panel: HTMLElement | null) => {
          setPanelRef(id, panel);
        },
        className: [
          focusedId === id ? "is-focused" : "",
          draggingId === id ? "is-dragging" : "",
          resizingId === id ? "is-resizing" : "",
          isCollapsed ? "is-collapsed" : ""
        ].filter(Boolean).join(" "),
        onPointerDownCapture: () => {
          setFocusedId(id);
        },
        onMouseDownCapture: () => {
          setFocusedId(id);
        },
        style: Object.keys(style).length ? style : undefined
      };
    },
    [collapsedIdSet, draggingId, focusedId, layout, resizingId, setPanelRef]
  );

  const beginDrag = useCallback(
    (id: DraggablePanelId, pointerId: number | null, clientX: number, clientY: number, panel: HTMLElement) => {
      if (!isPanelId(id)) {
        return;
      }

      if (dragState.current || resizeState.current) {
        return;
      }

      dragState.current = {
        id,
        pointerId,
        startX: clientX,
        startY: clientY,
        origin: layout[id],
        panelRect: getPanelRect(panel),
        panel,
        currentOffset: layout[id],
        frame: null,
        lastTime: performance.now(),
        velocityX: 0,
        velocityY: 0,
        released: false
      };
      panel.style.willChange = "transform";
      setFocusedId(id);
      setDraggingId(id);
    },
    [layout]
  );

  const beginResize = useCallback(
    (
      id: DraggablePanelId,
      handle: ResizeHandle,
      pointerId: number | null,
      clientX: number,
      clientY: number,
      panel: HTMLElement
    ) => {
      if (!isPanelId(id)) {
        return;
      }

      if (dragState.current || resizeState.current) {
        return;
      }

      const panelRect = getPanelRect(panel);
      const anchors = getResizeAnchors(panel, id);
      const origin = {
        ...layout[id],
        width: layout[id].width ?? Math.round(panelRect.width),
        height: layout[id].height ?? Math.round(panelRect.height)
      };

      resizeState.current = {
        id,
        handle,
        anchoredRight: anchors.right,
        anchoredBottom: anchors.bottom,
        pointerId,
        startX: clientX,
        startY: clientY,
        origin,
        panelRect,
        panel,
        currentLayout: origin,
        frame: null
      };
      panel.style.willChange = "width, height, transform";
      setFocusedId(id);
      setResizingId(id);
    },
    [layout]
  );

  const getHandleProps = useCallback(
    (id: DraggablePanelId, label: string) => ({
      type: "button" as const,
      className: "aptos-drag-handle glitch-hover",
      "data-panel-drag-surface": id,
      "aria-label": `Drag ${label}`,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        beginDrag(id, event.pointerId, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      },
      onMouseDown: (event: MouseEvent<HTMLButtonElement>) => {
        beginDrag(id, null, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      }
    }),
    [beginDrag]
  );

  const getDragSurfaceProps = useCallback(
    (id: DraggablePanelId, label: string) => ({
      className: "aptos-drag-handle glitch-hover",
      "data-panel-drag-surface": id,
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Drag ${label}`,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        beginDrag(id, event.pointerId, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      },
      onMouseDown: (event: MouseEvent<HTMLElement>) => {
        beginDrag(id, null, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
        }
      }
    }),
    [beginDrag]
  );

  const getResizeHandleProps = useCallback(
    (id: DraggablePanelId, label: string, handle: ResizeHandle) => ({
      type: "button" as const,
      className: `dot-test-resize-handle dot-test-resize-${handle}`,
      "aria-label": `Resize ${label} ${handle === "corner" ? "width and height" : handle}`,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        beginResize(id, handle, event.pointerId, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      },
      onMouseDown: (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        beginResize(id, handle, null, event.clientX, event.clientY, getPanelFromHandle(event.currentTarget));
      }
    }),
    [beginResize]
  );

  const isPanelCollapsed = useCallback((id: DraggablePanelId) => collapsedIdSet.has(id), [collapsedIdSet]);

  const togglePanelCollapsed = useCallback((id: DraggablePanelId) => {
    setFocusedId(id);
    setCollapsedIds((current) => (current.includes(id) ? current.filter((panelId) => panelId !== id) : [...current, id]));
  }, []);

  useEffect(() => {
    const handlePanelChromePointerDown = (event: globalThis.PointerEvent) => {
      if (event.defaultPrevented || event.button !== 0 || dragState.current || resizeState.current) {
        return;
      }

      const resizeHit = findPanelResizeHit(panelRefs.current, event.clientX, event.clientY, event.target);

      if (resizeHit) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setFocusedId(resizeHit.id);
        beginResize(resizeHit.id, resizeHit.handle, event.pointerId, event.clientX, event.clientY, resizeHit.panel);
        return;
      }

      const hit = findPanelChromeHit(panelRefs.current, event.clientX, event.clientY, event.target);

      if (!hit) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const collapseButton = Array.from(
        hit.dragSurface.querySelectorAll<HTMLElement>(PANEL_COLLAPSE_BUTTON_SELECTOR)
      ).find((button) => containsPoint(button.getBoundingClientRect(), event.clientX, event.clientY));

      if (collapseButton) {
        togglePanelCollapsed(hit.id);
        return;
      }

      try {
        hit.panel.setPointerCapture?.(event.pointerId);
      } catch {
        // The broker can receive events targeted at an overlapping panel. Drag still works via window listeners.
      }

      beginDrag(hit.id, event.pointerId, event.clientX, event.clientY, hit.panel);
    };

    document.addEventListener("pointerdown", handlePanelChromePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePanelChromePointerDown, true);
    };
  }, [beginDrag, beginResize, togglePanelCollapsed]);

  const resetPanelLayout = useCallback(() => {
    const active = dragState.current;
    if (active && active.frame !== null) {
      window.cancelAnimationFrame(active.frame);
      active.panel.style.willChange = "";
    }

    const resizing = resizeState.current;
    if (resizing && resizing.frame !== null) {
      window.cancelAnimationFrame(resizing.frame);
      resizing.panel.style.willChange = "";
    }

    window.localStorage.removeItem(PANEL_STORAGE_KEY);
    dragState.current = null;
    resizeState.current = null;
    setDraggingId(null);
    setResizingId(null);
    setFocusedId(null);
    setCollapsedIds([]);
    setLayout(DEFAULT_LAYOUT);
  }, []);

  return useMemo(
    () => ({
      layout,
      draggingId,
      resizingId,
      focusedId,
      collapsedIds,
      getPanelProps,
      getHandleProps,
      getDragSurfaceProps,
      getResizeHandleProps,
      isPanelCollapsed,
      togglePanelCollapsed,
      resetPanelLayout
    }),
    [
      collapsedIds,
      draggingId,
      focusedId,
      getDragSurfaceProps,
      getHandleProps,
      getPanelProps,
      getResizeHandleProps,
      isPanelCollapsed,
      layout,
      resetPanelLayout,
      resizingId,
      togglePanelCollapsed
    ]
  );
}
