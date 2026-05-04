import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowShell = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (value: boolean) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    opnrShell?: WindowShell;
    __TAURI_INTERNALS__?: unknown;
  }
}

let tauriShell: WindowShell | undefined;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function createTauriShell(): WindowShell {
  const appWindow = getCurrentWindow();

  return {
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
    isMaximized: () => appWindow.isMaximized(),
    onMaximizedChange: (callback) => {
      let disposed = false;
      const sync = () => {
        void appWindow.isMaximized().then((value) => {
          if (!disposed) callback(value);
        });
      };
      const unlisten = appWindow.onResized(sync);

      sync();

      return () => {
        disposed = true;
        void unlisten.then((off) => off());
      };
    },
    openExternal: (url) => openUrl(url)
  };
}

export function getWindowShell(): WindowShell | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.opnrShell) return window.opnrShell;
  if (!isTauriRuntime()) return undefined;

  tauriShell ??= createTauriShell();
  return tauriShell;
}
