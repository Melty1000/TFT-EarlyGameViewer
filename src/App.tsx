import { useMemo, useState } from "react";
import { CompListPane } from "./components/CompListPane";
import { TitleBar } from "./components/TitleBar";
import { compMatchesFilters, type PhaseFilter } from "./lib/filters";
import { useDataset } from "./lib/useDataset";

const PHASE_OPTIONS: PhaseFilter[] = ["all", "early", "mid", "late"];

export default function App() {
  const { data, error, isLoading } = useDataset();
  const [chips, setChips] = useState<string[]>([]);
  const [liveQuery, setLiveQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");

  const filteredComps = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.comps.filter((comp) => compMatchesFilters(comp, data, phaseFilter, chips, liveQuery));
  }, [chips, data, liveQuery, phaseFilter]);

  const addChip = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || chips.includes(normalized)) {
      return;
    }

    setChips((current) => [...current, normalized]);
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

  const resetFilters = () => {
    setChips([]);
    setDraftQuery("");
    setLiveQuery("");
    setPhaseFilter("all");
  };

  if (isLoading) {
    return (
      <main className="app-shell loading-shell">
        <TitleBar />
        <div className="status-card">
          <p className="eyebrow">Loading</p>
          <h1>Preparing the Set 17 comp board.</h1>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="app-shell loading-shell">
        <TitleBar />
        <div className="status-card error">
          <p className="eyebrow">Dataset error</p>
          <h1>The normalized TFT dataset could not be loaded.</h1>
          <p>{error ?? "Unknown dataset issue"}</p>
          <p className="quiet-copy">Run `npm run data:sync` and `npm run data:validate` to rebuild the local data bundle.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TitleBar />
      <header className="topbar">
        <div className="topbar-left">
          <h1 className="site-title">
            TFT <span className="accent">SET 17</span>
          </h1>
          <span className="topbar-subtitle">Early Game Viewer</span>
        </div>

        <div className="topbar-center">
          <div className="phase-switcher" role="group" aria-label="Global phase filter">
            {PHASE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={option === phaseFilter ? "phase-btn active" : "phase-btn"}
                aria-label={`Filter phase ${option}`}
                onClick={() => setPhaseFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="topbar-right">
          <div className="search-field" onClick={() => document.getElementById("global-filter")?.focus()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <div className="tags-wrapper">
              {chips.map((chip) => (
                <span key={chip} className="tag-chip">
                  {chip}
                  <button
                    type="button"
                    className="tag-close"
                    aria-label={`Remove filter ${chip}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeChip(chip);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <input
              id="global-filter"
              className="filter-input"
              aria-label="Quick search"
              placeholder="Search units, traits, augments..."
              value={draftQuery}
              onChange={(event) => {
                const value = event.target.value;
                setDraftQuery(value);
                setLiveQuery(value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitDraftChip();
                } else if (event.key === "Backspace" && !draftQuery && chips.length > 0) {
                  removeChip(chips[chips.length - 1]);
                }
              }}
            />
          </div>

          <button type="button" className="utility-button" onClick={resetFilters} aria-label="Reset filters">
            Reset
          </button>
        </div>
      </header>

      <div className="meta-strip">
        <span className="meta-item">
          Showing <strong>{filteredComps.length}</strong> of <strong>{data.comps.length}</strong> comps
        </span>
        <span className="meta-item">
          Dataset <strong>{new Date(data.meta.generatedAt).toLocaleDateString()}</strong> {new Date(data.meta.generatedAt).toLocaleTimeString()}
        </span>
      </div>

      <CompListPane comps={filteredComps} dataset={data} phaseFilter={phaseFilter} onQuickFilter={addChip} />
    </main>
  );
}
