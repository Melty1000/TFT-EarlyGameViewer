import { useMemo, useState } from "react";
import type { Comp, Dataset, Item } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";
import { COMPONENT_LABELS } from "../../shared/normalization";
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
import { getItemDisplay } from "../lib/items";
import {
  rankCompsBySimilarity,
  type SimilarityMatchBucket,
  type SimilarityResult,
  type SimilaritySelection
} from "../lib/similarity";
import { DetailPane, type DetailTab, type InspectorTarget } from "./DetailPane";

type SimilarityViewProps = {
  comps: Comp[];
  dataset: Dataset;
  phases: PhaseKey[];
  onQuickFilter: (label: string) => void;
};

type EntityKind = "champion" | "augment" | "item" | "component";

type EntityOption = {
  kind: EntityKind;
  id: string;
  name: string;
  icon: string;
  meta?: string;
};

const AUGMENT_TIER_ORDER: Record<string, number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  Unknown: 5
};

function getDefaultTab(phase: PhaseKey): DetailTab {
  return phase;
}

function getPrimaryPhase(phases: PhaseKey[]) {
  return phases[0] ?? "early";
}

function getPhaseFocusLabel(phases: PhaseKey[]) {
  return phases.length === 1 ? phases[0] : phases.join(" + ");
}

function isSelected(selection: SimilaritySelection, kind: EntityKind, id: string) {
  if (kind === "champion") {
    return selection.championIds.includes(id);
  }

  if (kind === "augment") {
    return selection.augmentIds.includes(id);
  }

  if (kind === "item") {
    return selection.itemIds.includes(id);
  }

  return selection.componentIds.includes(id);
}

function selectionCount(selection: SimilaritySelection) {
  return selection.championIds.length + selection.augmentIds.length + selection.itemIds.length + selection.componentIds.length;
}

function toggleId(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function removeOneId(values: string[], id: string) {
  const index = values.lastIndexOf(id);
  if (index === -1) {
    return values;
  }

  return [...values.slice(0, index), ...values.slice(index + 1)];
}

function getEntitySections(dataset: Dataset): { title: string; kind: EntityKind; options: EntityOption[] }[] {
  const champions = Object.values(dataset.championsById)
    .filter((champion) => champion.cost <= 5)
    .sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name))
    .map((champion) => ({
      kind: "champion" as const,
      id: champion.id,
      name: champion.name,
      icon: champion.icon
    }));
  const augments = Object.values(dataset.augmentsById)
    .sort((left, right) => {
      const leftTier = AUGMENT_TIER_ORDER[left.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      const rightTier = AUGMENT_TIER_ORDER[right.tier] ?? AUGMENT_TIER_ORDER.Unknown;
      return leftTier - rightTier || left.name.localeCompare(right.name);
    })
    .map((augment) => ({
      kind: "augment" as const,
      id: augment.id,
      name: augment.name,
      icon: augment.icon,
      meta: augment.tier === "Unknown" ? undefined : augment.tier
    }));
  const items = Object.values(dataset.itemsById)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item: Item) => ({
      kind: "item" as const,
      id: item.id,
      name: item.name,
      icon: item.icon
    }));
  const components = Object.entries(COMPONENT_LABELS).map(([componentId, label]) => ({
    kind: "component" as const,
    id: componentId,
    name: label,
    icon: `${import.meta.env.BASE_URL}assets/items/${componentId}.png`
  }));

  return [
    { title: "Champions", kind: "champion", options: champions },
    { title: "Augments", kind: "augment", options: augments },
    { title: "Items", kind: "item", options: items },
    { title: "Components", kind: "component", options: components }
  ];
}

function getEntityDisplay(dataset: Dataset, kind: EntityKind, id: string): EntityOption {
  if (kind === "champion") {
    const champion = dataset.championsById[id];
    return {
      kind,
      id,
      name: champion?.name ?? id,
      icon: champion?.icon ?? ""
    };
  }

  if (kind === "augment") {
    const augment = dataset.augmentsById[id];
    return {
      kind,
      id,
      name: augment?.name ?? id,
      icon: augment?.icon ?? "",
      meta: augment?.tier
    };
  }

  if (kind === "item") {
    const item = getItemDisplay(dataset, id);
    return {
      kind,
      id,
      name: item.name,
      icon: item.icon
    };
  }

  return {
    kind,
    id,
    name: COMPONENT_LABELS[id] ?? id,
    icon: `${import.meta.env.BASE_URL}assets/items/${id}.png`
  };
}

function SimilarityIconList({
  dataset,
  kind,
  bucket
}: {
  dataset: Dataset;
  kind: EntityKind;
  bucket: SimilarityMatchBucket;
}) {
  if (!bucket.selected.length) {
    return null;
  }

  const matchedCounts = bucket.matched.reduce<Record<string, number>>((counts, id) => {
    counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
  const seenCounts: Record<string, number> = {};

  return (
    <div className="similarity-match-group">
      <span className="similarity-match-label">
        {kind === "champion" ? "Champions" : kind === "augment" ? "Augments" : kind === "item" ? "Items" : "Components"}
      </span>
      <div className="similarity-match-icons">
        {bucket.selected.map((id, index) => {
          const option = getEntityDisplay(dataset, kind, id);
          const seen = seenCounts[id] ?? 0;
          const matched = seen < (matchedCounts[id] ?? 0);
          seenCounts[id] = seen + 1;
          return (
            <span
              key={`${kind}-${id}-${index}`}
              className={matched ? "similarity-mini-icon matched" : "similarity-mini-icon missing"}
              title={`${option.name}${matched ? " matched" : " not found"}`}
            >
              <img src={option.icon} alt={option.name} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SimilarityResultRow({
  result,
  dataset,
  phase,
  isExpanded,
  selectedTab,
  activePhase,
  inspector,
  lockedInspector,
  onToggleExpanded,
  onSelectTab,
  onActivePhaseChange,
  onHoverChampion,
  onHoverAugment,
  onHoverSynergy,
  onHoverItem,
  onToggleLock,
  onQuickFilter
}: {
  result: SimilarityResult;
  dataset: Dataset;
  phase: PhaseKey;
  isExpanded: boolean;
  selectedTab: DetailTab;
  activePhase: PhaseKey;
  inspector: InspectorTarget;
  lockedInspector: InspectorTarget;
  onToggleExpanded: () => void;
  onSelectTab: (value: DetailTab) => void;
  onActivePhaseChange: (value: PhaseKey) => void;
  onHoverChampion: (id: string | null) => void;
  onHoverAugment: (id: string | null) => void;
  onHoverSynergy: (id: string | null) => void;
  onHoverItem: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
}) {
  const comp = result.comp;
  const rank = getCompRankTags(comp)[0];
  const playstyle = getCompPlaystyle(comp);
  const playstyleIcon = getPlaystyleIcon(playstyle);
  const playstyleLabel = getPlaystyleLabel(playstyle);
  const sourceName = comp.sources[0]?.name ?? "source";

  return (
    <article
      className={isExpanded ? "similarity-result expanded" : "similarity-result"}
      data-comp-id={comp.id}
      data-testid="similarity-result"
    >
      <button type="button" className="similarity-result-header" aria-expanded={isExpanded} onClick={onToggleExpanded}>
        <div className="similarity-rankline">
          <span className="source-cell-label" title={getSourceDisplayName(sourceName)}>
            <span className="source-code">{getSourceAbbreviation(sourceName)}</span>
          </span>
          {rank ? (
            <span className={`rank-chip rank-${rank.tier.toLowerCase()}`} title={rank.label}>
              <img src={getRankIcon(rank.tier)} alt="" className="rank-icon" aria-hidden="true" />
            </span>
          ) : (
            <span className="rank-empty">--</span>
          )}
          {playstyleLabel ? (
            <span className="style-cell-text with-icon" title={playstyle ?? undefined}>
              {playstyleIcon ? <img src={playstyleIcon} alt="" className="style-cell-icon" /> : null}
              {playstyleLabel}
            </span>
          ) : null}
        </div>

        <div className="similarity-titleline">
          <h2>{getCompDisplayTitle(comp)}</h2>
          <span>{phase} unit focus</span>
        </div>

        <div className="similarity-score">
          <strong>{result.score}</strong>
          <span>score</span>
        </div>
      </button>

      <div className="similarity-breakdown">
        <SimilarityIconList dataset={dataset} kind="champion" bucket={result.breakdown.champions} />
        <SimilarityIconList dataset={dataset} kind="augment" bucket={result.breakdown.augments} />
        <SimilarityIconList dataset={dataset} kind="item" bucket={result.breakdown.items} />
        <SimilarityIconList dataset={dataset} kind="component" bucket={result.breakdown.components} />
      </div>

      {isExpanded ? (
        <div className="row-detail-shell similarity-detail-shell">
          <DetailPane
            comp={comp}
            dataset={dataset}
            activePhase={activePhase}
            selectedTab={selectedTab}
            onActivePhaseChange={onActivePhaseChange}
            onSelectTab={onSelectTab}
            inspector={inspector}
            lockedInspector={lockedInspector}
            onHoverChampion={onHoverChampion}
            onHoverAugment={onHoverAugment}
            onHoverSynergy={onHoverSynergy}
            onHoverItem={onHoverItem}
            onToggleLock={onToggleLock}
            onQuickFilter={onQuickFilter}
          />
        </div>
      ) : null}
    </article>
  );
}

export function SimilarityView({ comps, dataset, phases, onQuickFilter }: SimilarityViewProps) {
  const [pickerQuery, setPickerQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selection, setSelection] = useState<SimilaritySelection>({
    championIds: [],
    augmentIds: [],
    itemIds: [],
    componentIds: []
  });
  const [expandedCompIds, setExpandedCompIds] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, DetailTab>>({});
  const [activePhases, setActivePhases] = useState<Record<string, PhaseKey>>({});
  const [liveInspectors, setLiveInspectors] = useState<Record<string, InspectorTarget>>({});
  const [lockedInspectors, setLockedInspectors] = useState<Record<string, InspectorTarget>>({});
  const sections = useMemo(() => getEntitySections(dataset), [dataset]);
  const results = useMemo(
    () => rankCompsBySimilarity(comps, dataset, selection, phases),
    [comps, dataset, phases, selection]
  );
  const primaryPhase = getPrimaryPhase(phases);
  const phaseFocusLabel = getPhaseFocusLabel(phases);
  const hasSelection = selectionCount(selection) > 0;
  const normalizedQuery = pickerQuery.trim().toLowerCase();
  const filteredSections = sections.map((section) => ({
    ...section,
    options: normalizedQuery
      ? section.options.filter((option) => option.name.toLowerCase().includes(normalizedQuery) || option.id.includes(normalizedQuery))
      : section.options
  }));

  const toggleEntity = (kind: EntityKind, id: string) => {
    setSelection((current) => {
      if (kind === "champion") {
        return { ...current, championIds: toggleId(current.championIds, id) };
      }
      if (kind === "augment") {
        return { ...current, augmentIds: toggleId(current.augmentIds, id) };
      }
      if (kind === "item") {
        return { ...current, itemIds: toggleId(current.itemIds, id) };
      }
      return { ...current, componentIds: [...current.componentIds, id] };
    });
  };

  const removeComponent = (id: string) => {
    setSelection((current) => ({ ...current, componentIds: removeOneId(current.componentIds, id) }));
  };

  const ensureRowState = (compId: string) => {
    setSelectedTabs((current) => (current[compId] ? current : { ...current, [compId]: getDefaultTab(primaryPhase) }));
    setActivePhases((current) => (current[compId] ? current : { ...current, [compId]: primaryPhase }));
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
    <section className={sidebarCollapsed ? "similarity-shell sidebar-collapsed" : "similarity-shell"}>
      <aside className="similarity-sidebar" aria-label="Similarity entity picker">
        <div className="similarity-sidebar-head">
          <div className="similarity-sidebar-title">
            <h2>Similarity finder</h2>
            <button
              type="button"
              className="similarity-sidebar-toggle"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand similarity picker" : "Collapse similarity picker"}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>
          {!sidebarCollapsed ? <p>Select what you see or want. Builds stay visible and rank by overlap.</p> : null}
        </div>
        {!sidebarCollapsed ? (
          <>
            <input
              className="similarity-picker-search"
              aria-label="Search similarity options"
              placeholder="Find champion, item, augment..."
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
            />
            <div className="similarity-selected-bar">
              <span>{selectionCount(selection)} selected</span>
              <button
                type="button"
                onClick={() =>
                  setSelection({
                    championIds: [],
                    augmentIds: [],
                    itemIds: [],
                    componentIds: []
                  })
                }
              >
                Clear
              </button>
            </div>
            <div className="similarity-picker-sections">
              {filteredSections.map((section) => (
                <section key={section.kind} className="similarity-picker-section">
                  <div className="similarity-picker-heading">
                    <h3>{section.title}</h3>
                    <span>{section.options.length}</span>
                  </div>
                  <div className="similarity-picker-grid">
                    {section.options.map((option) => {
                      const selected = isSelected(selection, option.kind, option.id);
                      const componentCount =
                        option.kind === "component" ? selection.componentIds.filter((id) => id === option.id).length : 0;
                      const badge = option.kind === "component" && componentCount > 0 ? String(componentCount) : option.meta;
                      return (
                        <button
                          key={`${option.kind}-${option.id}`}
                          type="button"
                          className={selected ? "similarity-pick selected" : "similarity-pick"}
                          aria-label={`Select ${option.kind} ${option.name}`}
                          title={
                            option.kind === "component"
                              ? `${option.name} - left-click adds one, right-click removes one`
                              : option.meta
                                ? `${option.name} - ${option.meta}`
                                : option.name
                          }
                          onClick={() => toggleEntity(option.kind, option.id)}
                          onContextMenu={(event) => {
                            if (option.kind !== "component") {
                              return;
                            }
                            event.preventDefault();
                            removeComponent(option.id);
                          }}
                        >
                          <img src={option.icon} alt="" aria-hidden="true" />
                          {badge ? <span>{badge}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="similarity-collapsed-rail">
            <span>{selectionCount(selection)}</span>
            <p>selected</p>
          </div>
        )}
      </aside>

      <div className="similarity-results-shell">
        <div className="similarity-results-head">
          <div>
            <p className="eyebrow">Ranked overlap</p>
            <h2>{hasSelection ? `${results.length} builds ranked` : "Select icons to rank builds"}</h2>
          </div>
          <p>
            Champions score from <strong>{phaseFocusLabel}</strong> boards only. Items, emblems, augments, and components score globally.
          </p>
        </div>

        {hasSelection ? (
          <div className="similarity-results-list">
            {results.map((result) => {
              const compId = result.comp.id;
              return (
                <SimilarityResultRow
                  key={compId}
                  result={result}
                  dataset={dataset}
                  phase={primaryPhase}
                  isExpanded={expandedCompIds.includes(compId)}
                  selectedTab={selectedTabs[compId] ?? getDefaultTab(primaryPhase)}
                  activePhase={activePhases[compId] ?? primaryPhase}
                  inspector={liveInspectors[compId] ?? null}
                  lockedInspector={lockedInspectors[compId] ?? null}
                  onToggleExpanded={() => toggleExpanded(compId)}
                  onSelectTab={(value) => {
                    setSelectedTabs((current) => ({ ...current, [compId]: value }));
                    if (value !== "overview") {
                      setActivePhases((current) => ({ ...current, [compId]: value }));
                    }
                  }}
                  onActivePhaseChange={(value) => {
                    setActivePhases((current) => ({ ...current, [compId]: value }));
                  }}
                  onHoverChampion={(id) => {
                    if (lockedInspectors[compId]) {
                      return;
                    }
                    setLiveInspectors((current) => ({ ...current, [compId]: id ? { kind: "champion", id } : null }));
                  }}
                  onHoverAugment={(id) => {
                    if (lockedInspectors[compId]) {
                      return;
                    }
                    setLiveInspectors((current) => ({ ...current, [compId]: id ? { kind: "augment", id } : null }));
                  }}
                  onHoverSynergy={(id) => {
                    if (lockedInspectors[compId]) {
                      return;
                    }
                    setLiveInspectors((current) => ({ ...current, [compId]: id ? { kind: "synergy", id } : null }));
                  }}
                  onHoverItem={(id) => {
                    if (lockedInspectors[compId]) {
                      return;
                    }
                    setLiveInspectors((current) => ({ ...current, [compId]: id ? { kind: "item", id } : null }));
                  }}
                  onToggleLock={(target) => {
                    setLockedInspectors((current) => {
                      const existing = current[compId];
                      const isSame = existing && target && existing.kind === target.kind && existing.id === target.id;

                      return {
                        ...current,
                        [compId]: isSame ? null : target
                      };
                    });
                  }}
                  onQuickFilter={onQuickFilter}
                />
              );
            })}
          </div>
        ) : (
          <div className="similarity-empty">
            <h3>No hard filtering here.</h3>
            <p>Pick icons from the sidebar and every build will be sorted by similarity instead of removed from the list.</p>
          </div>
        )}
      </div>
    </section>
  );
}
