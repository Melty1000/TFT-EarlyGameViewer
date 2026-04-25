import { useState } from "react";
import type { PhaseFilter } from "../lib/filters";

type SearchPaneProps = {
  chips: string[];
  liveQuery: string;
  onLiveQueryChange: (value: string) => void;
  onAddChip: (value: string) => void;
  onRemoveChip: (value: string) => void;
  phaseFilter: PhaseFilter;
  onPhaseFilterChange: (value: PhaseFilter) => void;
  resultCount: number;
  totalCount: number;
  generatedAt: string;
};

const PHASE_OPTIONS: PhaseFilter[] = ["all", "early", "mid", "late"];

export function SearchPane({
  chips,
  liveQuery,
  onLiveQueryChange,
  onAddChip,
  onRemoveChip,
  phaseFilter,
  onPhaseFilterChange,
  resultCount,
  totalCount,
  generatedAt
}: SearchPaneProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const value = draft.trim();
    if (value) {
      onAddChip(value);
      setDraft("");
      onLiveQueryChange("");
    }
  };

  return (
    <aside className="pane pane-search">
      <div className="pane-heading">
        <p className="eyebrow">Scout faster</p>
        <h1>Scout</h1>
        <p className="pane-copy">Search units, traits, and augments.</p>
      </div>

      <div className="search-cluster">
        <input
          id="comp-filter"
          className="search-input"
          aria-label="Quick search"
          placeholder="Try 'Taric', 'Bastion', or 'Pandora'"
          value={draft || liveQuery}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            onLiveQueryChange(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commitDraft();
            } else if (event.key === "Backspace" && !draft && chips.length > 0) {
              onRemoveChip(chips[chips.length - 1]);
            }
          }}
        />
        <button className="ghost-button" type="button" onClick={commitDraft}>
          Add chip
        </button>
      </div>

      <div className="chip-area">
        {chips.length === 0 ? (
          <p className="quiet-copy">Pinned filters will appear here.</p>
        ) : (
          chips.map((chip) => (
            <button key={chip} className="chip" type="button" onClick={() => onRemoveChip(chip)}>
              {chip}
              <span aria-hidden="true">×</span>
            </button>
          ))
        )}
      </div>

      <div className="toggle-block">
        <span className="field-label">Phase focus</span>
        <div className="segmented-control">
          {PHASE_OPTIONS.map((option) => (
            <button
              key={option}
              className={option === phaseFilter ? "segment active" : "segment"}
              type="button"
              aria-label={`Filter phase ${option}`}
              onClick={() => onPhaseFilterChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="search-footer">
        <div className="stats-card">
          <div>
            <span className="stats-label">Showing</span>
            <strong>{resultCount}</strong>
          </div>
          <div>
            <span className="stats-label">Loaded</span>
            <strong>{totalCount}</strong>
          </div>
        </div>

        <div className="meta-card">
          <span className="field-label">Dataset freshness</span>
          <strong>{new Date(generatedAt).toLocaleDateString()}</strong>
          <p className="quiet-copy">{new Date(generatedAt).toLocaleTimeString()}</p>
        </div>
      </div>
    </aside>
  );
}
