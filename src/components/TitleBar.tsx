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

export function TitleBar() {
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

  if (!shell) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-btn"
          aria-label="Minimize"
          onClick={() => void shell.minimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-btn"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => void shell.toggleMaximize()}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-glass-heavy, #0d0d12)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          aria-label="Close"
          onClick={() => void shell.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
