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
  getRankIcon,
  getSourceAbbreviation,
  getSourceDisplayName
} from "../lib/compMeta";
import { type PhaseFilter } from "../lib/filters";
import { DetailPane, type DetailTab, type InspectorTarget } from "./DetailPane";

type CompListPaneProps = {
  comps: Comp[];
  dataset: Dataset;
  phaseFilter: PhaseFilter;
  onQuickFilter: (label: string) => void;
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
  X: 0,
  S: 1,
  A: 2,
  B: 3,
  C: 4,
  D: 5,
  Unknown: 6
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
  animate
}: {
  champions: Dataset["championsById"][string][];
  label: string;
  animate: boolean;
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
          <img
            key={`${champion.id}-${index}`}
            src={champion.icon}
            alt={champion.name}
            className={`comp-strip-icon cost-${champion.cost}`}
          />
        ))}
      </div>
    </div>
  );
}

function AugmentPreviewStrip({
  comp,
  dataset
}: {
  comp: Comp;
  dataset: Dataset;
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
          <span className="preview-token-badge">{augment.tier}</span>
        </div>
      ))}
    </div>
  );
}

function ComponentDemandStrip({ comp }: { comp: Comp }) {
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
          <span className="preview-token-badge">{component.count}</span>
        </span>
      ))}
    </div>
  );
}

function SourceCell({ comp }: { comp: Comp }) {
  const sourceName = comp.sources[0]?.name ?? "source";

  return (
    <div className="source-cell-label" title={getSourceDisplayName(sourceName)}>
      <span className="source-code">{getSourceAbbreviation(sourceName)}</span>
      <span className="source-full">{getSourceDisplayName(sourceName)}</span>
    </div>
  );
}

function RankCell({ comp }: { comp: Comp }) {
  const rank = getCompRankTags(comp)[0];

  if (!rank) {
    return <span className="rank-empty">--</span>;
  }

  return (
    <span
      className={`rank-chip rank-${rank.tier.toLowerCase()}`}
      title={rank.label}
      aria-label={`Build rank ${rank.label}`}
    >
      <img src={getRankIcon(rank.tier)} alt="" className="rank-icon" aria-hidden="true" />
    </span>
  );
}

function StyleCell({ playstyle }: { playstyle: string | null }) {
  const icon = getPlaystyleIcon(playstyle);
  const label = getPlaystyleLabel(playstyle);
  return (
    <span className={icon ? "style-cell-text with-icon" : "style-cell-text"} title={playstyle ?? undefined}>
      {icon ? <img src={icon} alt="" className="style-cell-icon" /> : null}
      {label ?? "--"}
    </span>
  );
}

export function CompListPane({ comps, dataset, phaseFilter, onQuickFilter }: CompListPaneProps) {
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
    const nextRows = [...rows].sort((left, right) => compareRows(left, right, sortKey));
    return sortDirection === "desc" ? nextRows.reverse() : nextRows;
  }, [rows, sortDirection, sortKey]);

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

  return (
    <section className="comp-list-shell">
      <div className="list-columns">
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
          const isExpanded = expandedCompIds.includes(row.key);
          const selectedTab = selectedTabs[row.key] ?? getDefaultDetailTab(phaseFilter);
          const activePhase = activePhases[row.key] ?? getDefaultBoardPhase(phaseFilter);
          const liveInspector = liveInspectors[row.key] ?? null;
          const lockedInspector = lockedInspectors[row.key] ?? null;

          return (
            <article
              key={row.key}
              className={isExpanded ? "comp-row expanded" : "comp-row"}
              data-comp-id={comp.id}
            >
              <div
                role="button"
                tabIndex={0}
                className="row-header-trigger"
                aria-expanded={isExpanded}
                aria-label={`Toggle comp ${row.title}`}
                onClick={() => toggleExpanded(row.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpanded(row.key);
                  }
                }}
              >
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
              </div>

              {isExpanded ? (
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
