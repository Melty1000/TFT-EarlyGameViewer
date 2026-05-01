import { useEffect, useState } from "react";

declare global {
  interface Window {
    opnrShell?: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (value: boolean) => void) => () => void;
    };
  }
}

type TitleBarProps = {
  variant?: "bar" | "controls";
};

export function TitleBar({ variant = "bar" }: TitleBarProps) {
  const shell = typeof window !== "undefined" ? window.opnrShell : undefined;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!shell) return;
    let cancelled = false;
    void shell.isMaximized().then((value) => {
      if (!cancelled) setIsMaximized(value);
    });
    const off = shell.onMaximizedChange(setIsMaximized);
    return () => {
      cancelled = true;
      off();
    };
  }, [shell]);

  if (!shell && variant === "bar") return null;

  const controls = (
    <div className="titlebar-controls">
      <button
        type="button"
        className="titlebar-btn"
        aria-label="Minimize"
        disabled={!shell}
        onClick={() => void shell?.minimize()}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="titlebar-btn"
        aria-label={isMaximized ? "Restore" : "Maximize"}
        disabled={!shell}
        onClick={() => void shell?.toggleMaximize()}
      >
        {isMaximized ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="5" y="2" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="2" y="5" width="7" height="7" fill="var(--aptos-surface-heavy, #0d0d12)" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2.25" y="2.25" width="9.5" height="9.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="titlebar-btn titlebar-btn-close"
        aria-label="Close"
        disabled={!shell}
        onClick={() => void shell?.close()}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  if (variant === "controls") {
    return controls;
  }

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      {controls}
    </div>
  );
}
