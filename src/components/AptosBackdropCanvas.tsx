import { useEffect, useRef } from "react";
import type { ThemeMode } from "../hooks/useThemeMode";

type Point = {
  x: number;
  y: number;
};

type Palette = {
  accentRgb: string;
  dotRgb: string;
  glow: string;
};

const DOT_SPACING = 16;
const DOT_RADIUS = 1.16;
const DOT_ALPHA = 0.48;
const RESTING_POINTER_INFLUENCE = 0.72;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPalette(themeMode: ThemeMode): Palette {
  if (themeMode === "light") {
    return {
      accentRgb: "242, 98, 44",
      dotRgb: "15, 15, 15",
      glow: "rgba(242, 98, 44, 0.08)"
    };
  }

  return {
    accentRgb: "217, 249, 51",
    dotRgb: "247, 247, 247",
    glow: "rgba(217, 249, 51, 0.09)"
  };
}

function getDotProjection(x: number, y: number, pointer: Point, radius: number, influence: number) {
  if (influence <= 0) {
    return { x, y, falloff: 0, depthLift: 0 };
  }

  const dx = x - pointer.x;
  const dy = y - pointer.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const falloff = Math.exp(-(distance * distance) / (radius * radius));
  const depthLift = falloff * influence;
  const perspective = 1 + depthLift * 0.62;
  const push = falloff * influence * 238;
  const swirl = falloff * influence * 22;

  return {
    x: pointer.x + dx * perspective + (dx / distance) * push + (-dy / distance) * swirl,
    y: pointer.y + dy * perspective + (dy / distance) * push + (dx / distance) * swirl,
    falloff,
    depthLift
  };
}

export function AptosBackdropCanvas({ themeMode }: { themeMode: ThemeMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") {
      return;
    }

    const isJsdom = window.navigator.userAgent.toLowerCase().includes("jsdom");
    const context = isJsdom ? null : canvas.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    const palette = getPalette(themeMode);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const pointerTarget: Point = { x: 0, y: 0 };
    const pointerCurrent: Point = { x: 0, y: 0 };
    const velocity: Point = { x: 0, y: 0 };
    let pointerActive = false;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!pointerTarget.x && !pointerTarget.y) {
        pointerTarget.x = width / 2;
        pointerTarget.y = height / 2;
        pointerCurrent.x = width / 2;
        pointerCurrent.y = height / 2;
      }
    };

    const getCanvasPoint = (event: PointerEvent): Point & { inside: boolean } => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      return {
        x: clamp(x, 0, rect.width),
        y: clamp(y, 0, rect.height),
        inside: x >= 0 && x <= rect.width && y >= 0 && y <= rect.height
      };
    };

    const handlePointerMove = (event: Event) => {
      const point = getCanvasPoint(event as PointerEvent);
      if (!point.inside) {
        pointerActive = false;
        velocity.x = 0;
        velocity.y = 0;
        if (!frame) {
          frame = window.requestAnimationFrame(draw);
        }
        return;
      }

      pointerTarget.x = point.x;
      pointerTarget.y = point.y;
      pointerActive = true;
      if (!frame) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const handlePointerLeave = () => {
      pointerActive = false;
      velocity.x = 0;
      velocity.y = 0;
      if (!frame) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const drawCursorWake = (influence: number, radius: number) => {
      if (influence <= 0) {
        return;
      }

      const gradient = context.createRadialGradient(pointerCurrent.x, pointerCurrent.y, 0, pointerCurrent.x, pointerCurrent.y, radius * 1.18);
      gradient.addColorStop(0, palette.glow);
      gradient.addColorStop(0.48, "rgba(255, 255, 255, 0.02)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = `rgba(${palette.accentRgb}, ${0.18 + influence * 0.32})`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(pointerCurrent.x, pointerCurrent.y, 54 + influence * 62, 0, Math.PI * 2);
      context.stroke();
    };

    const drawDotMatrix = (influence: number, radius: number) => {
      const startX = DOT_SPACING / 2;
      const startY = DOT_SPACING / 2;
      let clearedDots = 0;
      let displacedDots = 0;

      for (let y = startY; y < height + DOT_SPACING; y += DOT_SPACING) {
        for (let x = startX; x < width + DOT_SPACING; x += DOT_SPACING) {
          const dx = x - pointerCurrent.x;
          const dy = y - pointerCurrent.y;
          const sourceDistance = Math.hypot(dx, dy);
          const voidRadius = influence > 0 ? 54 + influence * 78 : 0;

          if (voidRadius > 0 && sourceDistance < voidRadius) {
            clearedDots += 1;
            continue;
          }

          const projection = getDotProjection(x, y, pointerCurrent, radius, influence);

          if (projection.x < -8 || projection.x > width + 8 || projection.y < -8 || projection.y > height + 8) {
            continue;
          }

          const ringDistance = voidRadius > 0 ? Math.abs(sourceDistance - voidRadius) : 9999;
          const ringBoost = influence > 0 ? clamp(1 - ringDistance / 58, 0, 1) : 0;
          const dotRadius = DOT_RADIUS * (1 + projection.depthLift * 5.2 + ringBoost * 2.8);
          const alpha = clamp(DOT_ALPHA + projection.falloff * influence * 0.58 + ringBoost * 0.28, 0.08, 1);
          const rgb = projection.falloff > 0.05 || ringBoost > 0 ? palette.accentRgb : palette.dotRgb;

          if (projection.falloff > 0.03 || ringBoost > 0) {
            displacedDots += 1;
          }

          context.fillStyle = `rgba(${rgb}, ${alpha})`;
          context.beginPath();
          context.arc(projection.x, projection.y, dotRadius, 0, Math.PI * 2);
          context.fill();
        }
      }

      canvas.dataset.clearedDots = String(clearedDots);
      canvas.dataset.displacedDots = String(displacedDots);
    };

    const draw = () => {
      const allowPointerMotion = pointerActive && !reducedMotion?.matches;
      let energy = 0;

      if (allowPointerMotion) {
        const previousX = pointerCurrent.x;
        const previousY = pointerCurrent.y;
        pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * 0.24;
        pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * 0.24;
        velocity.x = pointerCurrent.x - previousX;
        velocity.y = pointerCurrent.y - previousY;
        energy = clamp(Math.hypot(velocity.x, velocity.y) / 52, 0, 1);
      } else {
        velocity.x = 0;
        velocity.y = 0;
      }

      const influence = allowPointerMotion ? clamp(RESTING_POINTER_INFLUENCE + energy * 0.28, 0, 1) : 0;
      const radius = 330 + energy * 250;
      const distanceToTarget = Math.hypot(pointerTarget.x - pointerCurrent.x, pointerTarget.y - pointerCurrent.y);

      canvas.dataset.energy = energy.toFixed(3);
      canvas.dataset.pointerX = pointerCurrent.x.toFixed(1);
      canvas.dataset.pointerY = pointerCurrent.y.toFixed(1);
      canvas.dataset.depth = (1 + influence * 2.1).toFixed(2);
      canvas.dataset.pointerActive = allowPointerMotion ? "true" : "false";
      canvas.dataset.influence = influence.toFixed(3);

      context.clearRect(0, 0, width, height);
      drawCursorWake(influence, radius);
      drawDotMatrix(influence, radius);

      if (allowPointerMotion && distanceToTarget > 0.6) {
        frame = window.requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    const resizeAndDraw = () => {
      resize();
      if (!frame) {
        draw();
      }
    };

    resizeAndDraw();

    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(() => resizeAndDraw())
        : null;
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resizeAndDraw);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);
    document.addEventListener("mouseleave", handlePointerLeave);
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resizeAndDraw);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      document.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, [themeMode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="aptos-webgl-backdrop"
      data-idle-motion="static"
      data-layer-count="1"
      data-matrix="dot"
      data-renderer="clean-room-dot-matrix-field"
      data-testid="aptos-webgl-backdrop"
      data-theme-mode={themeMode}
      data-warp-mode="fisheye-dot-displacement"
    />
  );
}
