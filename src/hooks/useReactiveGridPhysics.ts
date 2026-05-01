import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useReactiveGridPhysics() {
  const shellRef = useRef<HTMLElement | null>(null);
  const target = useRef<Point>({ x: 0, y: 0 });
  const current = useRef<Point>({ x: 0, y: 0 });
  const velocity = useRef<Point>({ x: 0, y: 0 });
  const pointerActive = useRef(false);
  const frameRef = useRef<number | null>(null);

  const setShellRef = useCallback((node: HTMLElement | null) => {
    shellRef.current = node;

    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const center = {
      x: rect.width / 2,
      y: rect.height / 2
    };
    target.current = center;
    current.current = center;
    velocity.current = { x: 0, y: 0 };

    node.style.setProperty("--opnr-pointer-x", `${center.x}px`);
    node.style.setProperty("--opnr-pointer-y", `${center.y}px`);
    node.style.setProperty("--opnr-warp-radius", "190px");
  }, []);

  const tick = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      frameRef.current = null;
      return;
    }

    const rect = shell.getBoundingClientRect();
    const fallbackTarget = {
      x: rect.width / 2,
      y: rect.height / 2
    };

    if (!pointerActive.current) {
      target.current = fallbackTarget;
      current.current = fallbackTarget;
      velocity.current = { x: 0, y: 0 };
      shell.style.setProperty("--opnr-pointer-x", `${fallbackTarget.x.toFixed(2)}px`);
      shell.style.setProperty("--opnr-pointer-y", `${fallbackTarget.y.toFixed(2)}px`);
      shell.style.setProperty("--opnr-warp-radius", "190px");
      shell.style.setProperty("--opnr-parallax-x", "0");
      shell.style.setProperty("--opnr-parallax-y", "0");
      frameRef.current = window.requestAnimationFrame(tick);
      return;
    }

    const nextTarget = pointerActive.current ? target.current : fallbackTarget;
    const dx = nextTarget.x - current.current.x;
    const dy = nextTarget.y - current.current.y;

    velocity.current = {
      x: (velocity.current.x + dx * 0.082) * 0.74,
      y: (velocity.current.y + dy * 0.082) * 0.74
    };
    current.current = {
      x: current.current.x + velocity.current.x,
      y: current.current.y + velocity.current.y
    };

    const speed = Math.hypot(velocity.current.x, velocity.current.y);
    const energy = clamp(speed / 58, 0, 1);
    const radius = clamp(190 + speed * (4.8 + energy * 1.8), 190, 560);
    const xRatio = clamp(current.current.x / Math.max(rect.width, 1), 0, 1);
    const yRatio = clamp(current.current.y / Math.max(rect.height, 1), 0, 1);

    shell.style.setProperty("--opnr-pointer-x", `${current.current.x.toFixed(2)}px`);
    shell.style.setProperty("--opnr-pointer-y", `${current.current.y.toFixed(2)}px`);
    shell.style.setProperty("--opnr-warp-radius", `${radius.toFixed(2)}px`);
    shell.style.setProperty("--opnr-parallax-x", `${(xRatio - 0.5).toFixed(3)}`);
    shell.style.setProperty("--opnr-parallax-y", `${(yRatio - 0.5).toFixed(3)}`);

    frameRef.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [tick]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    pointerActive.current = true;
  }, []);

  const onPointerLeave = useCallback(() => {
    pointerActive.current = false;
  }, []);

  return {
    ref: setShellRef,
    onPointerMove,
    onPointerLeave
  };
}
