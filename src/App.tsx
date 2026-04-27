import { useMemo, useState } from "react";
import { CompListPane } from "./components/CompListPane";
import { SimilarityView } from "./components/SimilarityView";
import { TitleBar } from "./components/TitleBar";
import { getSourceAbbreviation, getSourceDisplayName } from "./lib/compMeta";
import { compMatchesFilters, type PhaseFilter } from "./lib/filters";
import { useDataset } from "./lib/useDataset";
import type { PhaseKey } from "../shared/normalization";

const PHASE_OPTIONS: PhaseFilter[] = ["all", "early", "mid", "late"];
const SIMILARITY_PHASE_OPTIONS: PhaseKey[] = ["early", "mid", "late"];
type ViewMode = "comps" | "similarity";

export default function App() {
  const { data, error, isLoading } = useDataset();
  const [chips, setChips] = useState<string[]>([]);
  const [liveQuery, setLiveQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [similarityPhases, setSimilarityPhases] = useState<PhaseKey[]>(["early"]);
  const [viewMode, setViewMode] = useState<ViewMode>("comps");
  const [hiddenSourceKeys, setHiddenSourceKeys] = useState<string[]>([]);

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
    setSimilarityPhases(["early"]);
    setHiddenSourceKeys([]);
  };

  const toggleSimilarityPhase = (phase: PhaseKey) => {
    setSimilarityPhases((current) => {
      if (current.includes(phase)) {
        return current.length === 1 ? current : current.filter((value) => value !== phase);
      }

      return [...current, phase];
    });
  };

  const toggleSourceVisibility = (sourceKey: string) => {
    setHiddenSourceKeys((current) =>
      current.includes(sourceKey) ? current.filter((key) => key !== sourceKey) : [...current, sourceKey]
    );
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
        <div className="topbar-brand">
          <img src={`${import.meta.env.BASE_URL}opnrgg.svg`} alt="" className="topbar-logo" aria-hidden="true" />
          <h1 className="site-title">
            opnr<span className="accent">.gg</span>
          </h1>
        </div>

        <div className="topbar-center">
          <div className="view-switcher" role="group" aria-label="App view">
            <button
              type="button"
              className={viewMode === "comps" ? "view-btn active" : "view-btn"}
              aria-label="Switch to comps view"
              onClick={() => setViewMode("comps")}
            >
              Comps
            </button>
            <button
              type="button"
              className={viewMode === "similarity" ? "view-btn active" : "view-btn"}
              aria-label="Switch to similarity view"
              onClick={() => setViewMode("similarity")}
            >
              Similarity
            </button>
          </div>
          <div className="phase-switcher" role="group" aria-label={viewMode === "similarity" ? "Similarity phase focus" : "Global phase filter"}>
            {(viewMode === "similarity" ? SIMILARITY_PHASE_OPTIONS : PHASE_OPTIONS).map((option) => (
              <button
                key={option}
                type="button"
                className={(viewMode === "similarity" ? similarityPhases.includes(option as PhaseKey) : option === phaseFilter) ? "phase-btn active" : "phase-btn"}
                aria-label={viewMode === "similarity" ? `Rank similarity by ${option} board` : `Filter phase ${option}`}
                onClick={() => {
                  if (viewMode === "similarity") {
                    toggleSimilarityPhase(option as PhaseKey);
                  } else {
                    setPhaseFilter(option as PhaseFilter);
                  }
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="topbar-right">
          {viewMode === "similarity" ? (
            <div className="similarity-mode-note">Sidebar icons rank builds. Source toggles hide providers.</div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </header>

      <div className="meta-strip">
        {viewMode === "similarity" ? (
          <span className="meta-item">
            Ranking <strong>{sourceFilteredComps.length}</strong> of <strong>{data.comps.length}</strong> comps by similarity
          </span>
        ) : (
          <span className="meta-item">
            Showing <strong>{filteredComps.length}</strong> of <strong>{data.comps.length}</strong> comps
          </span>
        )}
        <span className="meta-item">
          Dataset <strong>{new Date(data.meta.generatedAt).toLocaleDateString()}</strong> {new Date(data.meta.generatedAt).toLocaleTimeString()}
        </span>
        <div className="source-toggle-group" role="group" aria-label="Source visibility">
          {sourceOptions.map((source) => {
            const hidden = hiddenSourceKeys.includes(source.key);
            return (
              <button
                key={source.key}
                type="button"
                className={hidden ? "source-toggle hidden" : "source-toggle"}
                aria-pressed={!hidden}
                aria-label={`${hidden ? "Show" : "Hide"} source ${source.label}`}
                onClick={() => toggleSourceVisibility(source.key)}
              >
                <span>{source.abbreviation}</span>
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === "similarity" ? (
        <SimilarityView comps={sourceFilteredComps} dataset={data} phases={similarityPhases} onQuickFilter={addChip} />
      ) : (
        <CompListPane comps={filteredComps} dataset={data} phaseFilter={phaseFilter} onQuickFilter={addChip} />
      )}
    </main>
  );
}
