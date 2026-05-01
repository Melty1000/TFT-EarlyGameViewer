import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Comp, Dataset } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";
import {
  getCompDisplayTitle,
  getCompPlaystyle,
  getCompRankTags,
  getPlaystyleIcon,
  getPlaystyleLabel,
  getSourceAbbreviation,
  getSourceDisplayName
} from "../lib/compMeta";
import { type PhaseFilter } from "../lib/filters";
import { DetailPane, type DetailTab, type InspectorTarget } from "./DetailPane";
import { RankBadge } from "./RankBadge";

type CompListPaneProps = {
  comps: Comp[];
  dataset: Dataset;
  phaseFilter: PhaseFilter;
  onQuickFilter: (label: string) => void;
  selectedCompId?: string | null;
  onSelectComp?: (compId: string) => void;
  selectionOnly?: boolean;
  lockSort?: boolean;
  similarityReadouts?: Record<string, { score: number; percent: number }>;
};

type CompRow = {
  key: string;
  title: string;
  comp: Comp;
};

type SortKey = "name" | "source" | "rank" | "style";
type SortDirection = "asc" | "desc";

const AUGMENT_TIER_ORDER: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  Unknown: 5
};

const RANK_SORT_ORDER: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  Unknown: 5,
  X: 6
};

function buildCompRows(visibleComps: Comp[]): CompRow[] {
  return visibleComps.map((comp) => ({
    key: comp.id,
    title: getCompDisplayTitle(comp),
    comp
  }));
}

function getPreviewPhase(phaseFilter: PhaseFilter): PhaseKey {
  return phaseFilter === "all" ? "early" : phaseFilter;
}

function getDefaultDetailTab(phaseFilter: PhaseFilter): DetailTab {
  return phaseFilter === "all" ? "overview" : phaseFilter;
}

function getDefaultBoardPhase(phaseFilter: PhaseFilter): PhaseKey {
  return phaseFilter === "all" ? "late" : phaseFilter;
}

function compareRows(left: CompRow, right: CompRow, sortKey: SortKey) {
  if (sortKey === "source") {
    const leftSource = getSourceDisplayName(left.comp.sources[0]?.name ?? "");
    const rightSource = getSourceDisplayName(right.comp.sources[0]?.name ?? "");
    return leftSource.localeCompare(rightSource) || left.title.localeCompare(right.title);
  }

  if (sortKey === "rank") {
    const leftRank = getCompRankTags(left.comp)[0]?.tier ?? "Unknown";
    const rightRank = getCompRankTags(right.comp)[0]?.tier ?? "Unknown";
    return (
      (RANK_SORT_ORDER[leftRank] ?? RANK_SORT_ORDER.Unknown) -
        (RANK_SORT_ORDER[rightRank] ?? RANK_SORT_ORDER.Unknown) ||
      left.title.localeCompare(right.title)
    );
  }

  if (sortKey === "style") {
    const leftStyle = getPlaystyleLabel(getCompPlaystyle(left.comp)) ?? "--";
    const rightStyle = getPlaystyleLabel(getCompPlaystyle(right.comp)) ?? "--";
    return leftStyle.localeCompare(rightStyle) || left.title.localeCompare(right.title);
  }

  return left.title.localeCompare(right.title);
}

function AnimatedChampionStrip({
  champions,
  label,
  animate,
  compact = false
}: {
  champions: Dataset["championsById"][string][];
  label: string;
  animate: boolean;
  compact?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) {
        setOverflow(0);
        return;
      }
      setOverflow(Math.max(track.scrollWidth - viewport.clientWidth, 0));
    };

    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      if (viewportRef.current) {
        observer.observe(viewportRef.current);
      }
      if (trackRef.current) {
        observer.observe(trackRef.current);
      }
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [champions]);

  const shouldAnimate = overflow > 0 && (hovered || animate);
  const style = {
    "--shortlist-scroll-distance": `-${overflow}px`,
    "--shortlist-scroll-duration": `${Math.max(5, overflow / 18)}s`
  } as CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={shouldAnimate ? "shortlist-icon-strip is-animating" : "shortlist-icon-strip"}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div ref={trackRef} className="shortlist-icon-track" style={style}>
        {champions.map((champion, index) => (
          <span key={`${champion.id}-${index}`} className={compact ? "comp-strip-token compact" : "comp-strip-token"}>
            <img src={champion.icon} alt={champion.name} className={`comp-strip-icon cost-${champion.cost}`} />
          </span>
        ))}
      </div>
    </div>
  );
}

function AugmentPreviewStrip({
  comp,
  dataset,
  showLabels = false
}: {
  comp: Comp;
  dataset: Dataset;
  showLabels?: boolean;
}) {
  const previewAugments = comp.recommendedAugmentIds
    .map((augmentId, index) => ({ augmentId, index, augment: dataset.augmentsById[augmentId] }))
    .filter((entry): entry is { augmentId: string; index: number; augment: Dataset["augmentsById"][string] } =>
      Boolean(entry.augment)
    )
    .sort((left, right) => {
      const leftOrder = AUGMENT_TIER_ORDER[left.augment.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      const rightOrder = AUGMENT_TIER_ORDER[right.augment.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .slice(0, 3);

  return (
    <div className="row-preview-augs">
      {previewAugments.map(({ augment }) => (
        <div
          key={augment.id}
          data-preview-kind="augment"
          className={`preview-token tier-${augment.tier.toLowerCase()}`}
          title={`${augment.name} (${augment.tier})`}
        >
          <img src={augment.icon} alt={augment.name} className="preview-token-icon" />
          {showLabels ? <span className="preview-token-label">{augment.name}</span> : null}
          <span className="preview-token-badge">{augment.tier}</span>
        </div>
      ))}
    </div>
  );
}

function ComponentDemandStrip({ comp, showLabels = false }: { comp: Comp; showLabels?: boolean }) {
  return (
    <div className="row-component-demand">
      {comp.componentDemand.slice(0, 4).map((component) => (
        <span
          key={component.componentId}
          data-preview-kind="component"
          className="preview-token"
          title={`${component.count}x ${component.label}`}
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/items/${component.componentId}.png`}
            alt={component.label}
            className="preview-token-icon component-token-icon"
          />
          {showLabels ? <span className="preview-token-label">{component.label}</span> : null}
          <span className="preview-token-badge">{component.count}</span>
        </span>
      ))}
    </div>
  );
}

function SourceCell({ comp }: { comp: Comp }) {
  const sourceName = comp.sources[0]?.name ?? "source";
  const evidenceCount = comp.sources[0]?.evidence.length ?? 0;

  return (
    <div className="source-cell-label" title={getSourceDisplayName(sourceName)}>
      <span className="source-code">{getSourceAbbreviation(sourceName)}</span>
      <span className="source-full">{getSourceDisplayName(sourceName)}</span>
      <span className="source-evidence-count">{evidenceCount ? `${evidenceCount} signals` : "no evidence"}</span>
    </div>
  );
}

function RankCell({ comp }: { comp: Comp }) {
  const rank = getCompRankTags(comp)[0];

  if (!rank) {
    return <span className="rank-empty">--</span>;
  }

  return <RankBadge tier={rank.tier} label={rank.label} />;
}

function isRollPlaystyle(playstyle: string | null) {
  const normalized = playstyle?.toLowerCase() ?? "";
  return normalized.includes("reroll") || normalized.includes("slow");
}

function getStyleCode(playstyle: string | null, label: string | null, usesRollIcon: boolean) {
  const source = `${label ?? ""} ${playstyle ?? ""}`.trim();
  const normalized = source.toLowerCase();
  const costMatch =
    normalized.match(/\b([1-9]\d*)\s*[- ]?\s*cost\b/) ?? normalized.match(/\b([1-9]\d*)c\b/);
  const levelMatch =
    normalized.match(/\b(?:level|lvl|l)\s*(\d+)\b/) ??
    normalized.match(/\bfast\s*(\d+)\b/) ??
    normalized.match(/\b(\d+)\b/);

  if (costMatch) {
    return `${costMatch[1]}C`;
  }

  if (levelMatch) {
    return levelMatch ? `L${levelMatch[1]}` : "LV";
  }

  if (usesRollIcon) {
    return "RR";
  }

  if (normalized.includes("tempo")) {
    return "TP";
  }

  if (normalized.includes("flex")) {
    return "FX";
  }

  const tokenCode = (label ?? playstyle ?? "--")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((token) => token[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return tokenCode || "--";
}

function StyleCell({ playstyle }: { playstyle: string | null }) {
  const usesRollIcon = isRollPlaystyle(playstyle);
  const icon = getPlaystyleIcon(playstyle);
  const label = getPlaystyleLabel(playstyle);
  const styleCode = getStyleCode(playstyle, label, usesRollIcon);
  const hasVisualIcon = Boolean(icon);
  const iconStyle = icon
    ? ({
        "--style-icon-url": `url("${icon}")`
      } as CSSProperties)
    : undefined;

  return (
    <span
      className={usesRollIcon ? "style-cell-text custom-style-badge with-icon" : "style-cell-text custom-style-badge"}
      title={playstyle ?? undefined}
      data-style-code={styleCode}
    >
      <span className="style-glyph" aria-hidden="true">
        {icon ? (
          <span
            className={usesRollIcon ? "style-cell-icon style-cell-roll-icon" : "style-cell-icon"}
            style={iconStyle}
          />
        ) : null}
        {!hasVisualIcon ? <strong>{styleCode}</strong> : null}
      </span>
      {hasVisualIcon ? <span className="style-code">{styleCode}</span> : null}
      <span className="style-cell-label">{label ?? "--"}</span>
    </span>
  );
}

export function CompListPane({
  comps,
  dataset,
  phaseFilter,
  onQuickFilter,
  selectedCompId = null,
  onSelectComp,
  selectionOnly = false,
  lockSort = false,
  similarityReadouts = {}
}: CompListPaneProps) {
  const rows = useMemo(() => buildCompRows(comps), [comps]);
  const [expandedCompIds, setExpandedCompIds] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, DetailTab>>({});
  const [activePhases, setActivePhases] = useState<Record<string, PhaseKey>>({});
  const [liveInspectors, setLiveInspectors] = useState<Record<string, InspectorTarget>>({});
  const [lockedInspectors, setLockedInspectors] = useState<Record<string, InspectorTarget>>({});
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    const visibleIds = new Set(rows.map((row) => row.key));

    setExpandedCompIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [rows]);

  const previewPhase = getPreviewPhase(phaseFilter);
  const sortedRows = useMemo(() => {
    if (lockSort) {
      return rows;
    }

    const nextRows = [...rows].sort((left, right) => compareRows(left, right, sortKey));
    return sortDirection === "desc" ? nextRows.reverse() : nextRows;
  }, [lockSort, rows, sortDirection, sortKey]);
  const usesSelectionMode = selectionOnly || Boolean(onSelectComp);

  const changeSort = (nextSortKey: SortKey) => {
    setSortKey((currentSortKey) => {
      if (currentSortKey === nextSortKey) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return currentSortKey;
      }

      setSortDirection("asc");
      return nextSortKey;
    });
  };

  const ensureRowState = (compId: string) => {
    setSelectedTabs((current) =>
      current[compId] ? current : { ...current, [compId]: getDefaultDetailTab(phaseFilter) }
    );
    setActivePhases((current) =>
      current[compId] ? current : { ...current, [compId]: getDefaultBoardPhase(phaseFilter) }
    );
  };

  const toggleExpanded = (compId: string) => {
    ensureRowState(compId);
    setExpandedCompIds((current) => {
      if (current.includes(compId)) {
        setLiveInspectors((inspectors) => ({ ...inspectors, [compId]: null }));
        return current.filter((id) => id !== compId);
      }

      return [...current, compId];
    });
  };

  const activateRow = (compId: string) => {
    if (usesSelectionMode) {
      onSelectComp?.(compId);
      return;
    }

    toggleExpanded(compId);
  };

  return (
    <section className={usesSelectionMode ? "comp-list-shell selection-mode" : "comp-list-shell"}>
      <div className={usesSelectionMode ? "list-columns selection-list-columns" : "list-columns"}>
        {usesSelectionMode ? (
          <>
            <span className="selection-header-latch" aria-hidden="true" />
            <button
              type="button"
              className={sortKey === "rank" ? "column-sort-button active" : "column-sort-button"}
              aria-label="Sort by rank"
              aria-sort={sortKey === "rank" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              onClick={() => changeSort("rank")}
            >
              Rank
            </button>
            <div className="selection-build-header">
              <button
                type="button"
                className={sortKey === "source" ? "column-sort-button active" : "column-sort-button"}
                aria-label="Sort by source"
                aria-sort={sortKey === "source" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => changeSort("source")}
              >
                Source
              </button>
              <button
                type="button"
                className={sortKey === "name" ? "column-sort-button active" : "column-sort-button"}
                aria-label="Sort by comp name"
                aria-sort={sortKey === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => changeSort("name")}
              >
                Build
              </button>
              <button
                type="button"
                className={sortKey === "style" ? "column-sort-button active" : "column-sort-button"}
                aria-label="Sort by style"
                aria-sort={sortKey === "style" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => changeSort("style")}
              >
                Style
              </button>
            </div>
            <div className="selection-static-column selection-preview-header" data-preview-column="champions">
              Champions
            </div>
            <div className="selection-static-column selection-preview-header" data-preview-column="augments">
              Augments
            </div>
            <div className="selection-static-column selection-preview-header" data-preview-column="components">
              Components
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className={sortKey === "source" ? "column-sort-button active" : "column-sort-button"}
              aria-label="Sort by source"
              aria-sort={sortKey === "source" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              onClick={() => changeSort("source")}
            >
              Source
            </button>
            <button
              type="button"
              className={sortKey === "rank" ? "column-sort-button active" : "column-sort-button"}
              aria-label="Sort by rank"
              aria-sort={sortKey === "rank" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              onClick={() => changeSort("rank")}
            >
              Rank
            </button>
            <button
              type="button"
              className={sortKey === "style" ? "column-sort-button active" : "column-sort-button"}
              aria-label="Sort by style"
              aria-sort={sortKey === "style" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              onClick={() => changeSort("style")}
            >
              Style
            </button>
            <button
              type="button"
              className={sortKey === "name" ? "column-sort-button active" : "column-sort-button"}
              aria-label="Sort by comp name"
              aria-sort={sortKey === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              onClick={() => changeSort("name")}
            >
              Composition
            </button>
            <div>Champions</div>
            <div>Augments</div>
            <div>Components</div>
          </>
        )}
      </div>

      <div className="comp-list-body">
        {sortedRows.length === 0 ? (
          <div className="empty-results">
            <p>No compositions match the current search.</p>
          </div>
        ) : null}

        {sortedRows.map((row) => {
          const comp = row.comp;
          const previewChampionIds = comp.phases[previewPhase].boardSlots
            .map((slot) => slot.championId)
            .filter((championId): championId is string => Boolean(championId));
          const previewChampions = (previewChampionIds.length ? previewChampionIds : comp.phases[previewPhase].championIds)
            .map((championId) => dataset.championsById[championId])
            .filter(Boolean);
          const playstyle = getCompPlaystyle(comp);
          const isExpanded = usesSelectionMode ? false : expandedCompIds.includes(row.key);
          const isSelected = selectedCompId === row.key;
          const selectedTab = selectedTabs[row.key] ?? getDefaultDetailTab(phaseFilter);
          const activePhase = activePhases[row.key] ?? getDefaultBoardPhase(phaseFilter);
          const liveInspector = liveInspectors[row.key] ?? null;
          const lockedInspector = lockedInspectors[row.key] ?? null;
          const sourceName = comp.sources[0]?.name ?? "source";
          const sourceDisplayName = getSourceDisplayName(sourceName);
          const evidenceCount = comp.sources[0]?.evidence.length ?? 0;
          const similarityReadout = similarityReadouts[comp.id];

          return (
            <article
              key={row.key}
              className={[
                "comp-row",
                isExpanded ? "expanded" : "",
                isSelected ? "is-selected" : "",
                usesSelectionMode ? "selection-mode" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              data-comp-id={comp.id}
              aria-selected={usesSelectionMode ? isSelected : undefined}
            >
              <div
                role="button"
                tabIndex={0}
                className="row-header-trigger"
                aria-expanded={usesSelectionMode ? undefined : isExpanded}
                aria-label={usesSelectionMode ? `Select comp ${row.title}` : `Toggle comp ${row.title}`}
                onClick={() => activateRow(row.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activateRow(row.key);
                  }
                }}
              >
                {usesSelectionMode ? (
                  <>
                    <span className="row-active-latch" aria-hidden="true" />

                    <div className="rank-cell selection-rank-cell" data-testid="rank-cell">
                      <RankCell comp={comp} />
                    </div>

                    <div className="row-name selection-composition-cell" data-testid="composition-cell">
                      <div className="selection-row-meta">
                        <span className="selection-source-readout" title={sourceDisplayName}>
                          [ {sourceDisplayName} ]
                        </span>
                        <span>[ {previewPhase} / {previewChampions.length} ]</span>
                        <span>[ {evidenceCount} evidence ]</span>
                        {similarityReadout ? <strong>[ SIM {similarityReadout.score} / {similarityReadout.percent}% ]</strong> : null}
                        {isSelected ? <strong>[ ACTIVE ]</strong> : null}
                      </div>
                      <h2>{row.title}</h2>
                      <div className="selection-style-readout">
                        <StyleCell playstyle={playstyle} />
                      </div>
                    </div>

                    <div
                      className="champions-cell selection-formation-cell selection-preview-cell"
                      data-preview-column="champions"
                    >
                      <AnimatedChampionStrip
                        champions={previewChampions}
                        label={`${row.title} ${previewPhase} champions`}
                        animate={isExpanded}
                        compact
                      />
                    </div>

                    <div className="augments-cell selection-token-cell selection-preview-cell" data-preview-column="augments">
                      <AugmentPreviewStrip comp={comp} dataset={dataset} />
                    </div>

                    <div className="components-cell selection-token-cell selection-preview-cell" data-preview-column="components">
                      <ComponentDemandStrip comp={comp} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="source-cell" data-testid="source-cell">
                      <SourceCell comp={comp} />
                    </div>

                    <div className="rank-cell" data-testid="rank-cell">
                      <RankCell comp={comp} />
                    </div>

                    <div className="style-cell" data-testid="style-cell">
                      <StyleCell playstyle={playstyle} />
                    </div>

                    <div className="row-name" data-testid="composition-cell">
                      <h2>{row.title}</h2>
                    </div>

                    <div className="champions-cell">
                      <AnimatedChampionStrip
                        champions={previewChampions}
                        label={`${row.title} ${previewPhase} champions`}
                        animate={isExpanded}
                      />
                    </div>

                    <div className="augments-cell">
                      <AugmentPreviewStrip comp={comp} dataset={dataset} />
                    </div>

                    <div className="components-cell">
                      <ComponentDemandStrip comp={comp} />
                    </div>
                  </>
                )}
              </div>

              {!usesSelectionMode && isExpanded ? (
                <div className="row-detail-shell">
                  <DetailPane
                    comp={comp}
                    dataset={dataset}
                    activePhase={activePhase}
                    selectedTab={selectedTab}
                    onActivePhaseChange={(value) => {
                      setActivePhases((current) => ({ ...current, [row.key]: value }));
                    }}
                    onSelectTab={(value) => {
                      setSelectedTabs((current) => ({ ...current, [row.key]: value }));
                      if (value !== "overview") {
                        setActivePhases((current) => ({ ...current, [row.key]: value }));
                      }
                    }}
                    inspector={liveInspector}
                    lockedInspector={lockedInspector}
                    onHoverChampion={(id) => {
                      if (lockedInspectors[row.key]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [row.key]: id ? { kind: "champion", id } : null
                      }));
                    }}
                    onHoverAugment={(id) => {
                      if (lockedInspectors[row.key]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [row.key]: id ? { kind: "augment", id } : null
                      }));
                    }}
                    onHoverSynergy={(id) => {
                      if (lockedInspectors[row.key]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [row.key]: id ? { kind: "synergy", id } : null
                      }));
                    }}
                    onHoverItem={(id) => {
                      if (lockedInspectors[row.key]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [row.key]: id ? { kind: "item", id } : null
                      }));
                    }}
                    onToggleLock={(target) => {
                      setLockedInspectors((current) => {
                        const existing = current[row.key];
                        const isSame =
                          existing &&
                          target &&
                          existing.kind === target.kind &&
                          existing.id === target.id;

                        return {
                          ...current,
                          [row.key]: isSame ? null : target
                        };
                      });
                    }}
                    onQuickFilter={onQuickFilter}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
