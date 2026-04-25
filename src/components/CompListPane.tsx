import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Comp, Dataset } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";
import { type PhaseFilter } from "../lib/filters";
import { DetailPane, type DetailTab, type InspectorTarget } from "./DetailPane";

type CompListPaneProps = {
  comps: Comp[];
  dataset: Dataset;
  phaseFilter: PhaseFilter;
  onQuickFilter: (label: string) => void;
};

function getPreviewPhase(phaseFilter: PhaseFilter): PhaseKey {
  return phaseFilter === "all" ? "early" : phaseFilter;
}

function getDefaultDetailTab(phaseFilter: PhaseFilter): DetailTab {
  return phaseFilter === "all" ? "overview" : phaseFilter;
}

function getDefaultBoardPhase(phaseFilter: PhaseFilter): PhaseKey {
  return phaseFilter === "all" ? "late" : phaseFilter;
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
        {champions.map((champion) => (
          <img
            key={champion.id}
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
  return (
    <div className="row-preview-augs">
      {comp.recommendedAugmentIds.slice(0, 3).map((augmentId) => {
        const augment = dataset.augmentsById[augmentId];
        if (!augment) {
          return null;
        }

        return (
          <div key={augment.id} className={`aug-pill tier-${augment.tier.toLowerCase()}`} title={augment.name}>
            <img src={augment.icon} alt={augment.name} className="aug-pill-icon" />
            <span className="aug-pill-rank">{augment.tier}</span>
          </div>
        );
      })}
    </div>
  );
}

function ComponentDemandStrip({ comp }: { comp: Comp }) {
  return (
    <div className="row-component-demand">
      {comp.componentDemand.slice(0, 4).map((component) => (
        <span
          key={component.componentId}
          className="demand-pill demand-pill-visual"
          title={`${component.count}x ${component.label}`}
        >
          <img
            src={`/assets/items/${component.componentId}.png`}
            alt={component.label}
            className="demand-pill-icon"
          />
          <span className="demand-pill-count">{component.count}</span>
        </span>
      ))}
    </div>
  );
}

export function CompListPane({ comps, dataset, phaseFilter, onQuickFilter }: CompListPaneProps) {
  const [expandedCompIds, setExpandedCompIds] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, DetailTab>>({});
  const [activePhases, setActivePhases] = useState<Record<string, PhaseKey>>({});
  const [liveInspectors, setLiveInspectors] = useState<Record<string, InspectorTarget>>({});
  const [lockedInspectors, setLockedInspectors] = useState<Record<string, InspectorTarget>>({});

  useEffect(() => {
    const visibleIds = new Set(comps.map((comp) => comp.id));

    setExpandedCompIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [comps]);

  const previewPhase = getPreviewPhase(phaseFilter);

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
        <div>Composition</div>
        <div>Champions</div>
        <div>Augments</div>
        <div>Components</div>
      </div>

      <div className="comp-list-body">
        {comps.length === 0 ? (
          <div className="empty-results">
            <p>No compositions match the current search.</p>
          </div>
        ) : null}

        {comps.map((comp) => {
          const previewChampions = comp.phases[previewPhase].championIds
            .map((championId) => dataset.championsById[championId])
            .filter(Boolean);
          const isExpanded = expandedCompIds.includes(comp.id);
          const selectedTab = selectedTabs[comp.id] ?? getDefaultDetailTab(phaseFilter);
          const activePhase = activePhases[comp.id] ?? getDefaultBoardPhase(phaseFilter);
          const liveInspector = liveInspectors[comp.id] ?? null;
          const lockedInspector = lockedInspectors[comp.id] ?? null;

          return (
            <article key={comp.id} className={isExpanded ? "comp-row expanded" : "comp-row"}>
              <button
                type="button"
                className="row-header-trigger"
                aria-expanded={isExpanded}
                aria-label={`Toggle comp ${comp.title}`}
                onClick={() => toggleExpanded(comp.id)}
              >
                <div className="row-name">
                  <h2>{comp.title}</h2>
                </div>

                <AnimatedChampionStrip
                  champions={previewChampions}
                  label={`${comp.title} ${previewPhase} champions`}
                  animate={isExpanded}
                />

                <AugmentPreviewStrip comp={comp} dataset={dataset} />
                <ComponentDemandStrip comp={comp} />
              </button>

              {isExpanded ? (
                <div className="row-detail-shell">
                  <DetailPane
                    comp={comp}
                    dataset={dataset}
                    activePhase={activePhase}
                    selectedTab={selectedTab}
                    onActivePhaseChange={(value) => {
                      setActivePhases((current) => ({ ...current, [comp.id]: value }));
                    }}
                    onSelectTab={(value) => {
                      setSelectedTabs((current) => ({ ...current, [comp.id]: value }));
                      if (value !== "overview") {
                        setActivePhases((current) => ({ ...current, [comp.id]: value }));
                      }
                    }}
                    inspector={liveInspector}
                    lockedInspector={lockedInspector}
                    onHoverChampion={(id) => {
                      if (lockedInspectors[comp.id]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [comp.id]: id ? { kind: "champion", id } : null
                      }));
                    }}
                    onHoverAugment={(id) => {
                      if (lockedInspectors[comp.id]) {
                        return;
                      }
                      setLiveInspectors((current) => ({
                        ...current,
                        [comp.id]: id ? { kind: "augment", id } : null
                      }));
                    }}
                    onToggleLock={(target) => {
                      setLockedInspectors((current) => {
                        const existing = current[comp.id];
                        const isSame =
                          existing &&
                          target &&
                          existing.kind === target.kind &&
                          existing.id === target.id;

                        return {
                          ...current,
                          [comp.id]: isSame ? null : target
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
