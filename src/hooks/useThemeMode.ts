import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "opnr:aptos-theme:v1";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light";
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "dark";
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-opnr-theme", themeMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  return {
    themeMode,
    toggleThemeMode: () => setThemeMode((current) => (current === "dark" ? "light" : "dark"))
  };
}
