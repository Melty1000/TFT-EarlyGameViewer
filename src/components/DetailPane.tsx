import type { Augment, Champion, Comp, Dataset } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";

export type InspectorTarget =
  | { kind: "champion"; id: string }
  | { kind: "augment"; id: string }
  | null;

export type DetailTab = "overview" | PhaseKey;

type DetailPaneProps = {
  comp: Comp;
  dataset: Dataset;
  activePhase: PhaseKey;
  selectedTab: DetailTab;
  onActivePhaseChange: (value: PhaseKey) => void;
  onSelectTab: (value: DetailTab) => void;
  inspector: InspectorTarget;
  lockedInspector: InspectorTarget;
  onHoverChampion: (id: string | null) => void;
  onHoverAugment: (id: string | null) => void;
  onToggleLock: (target: InspectorTarget) => void;
  onQuickFilter: (label: string) => void;
};

const DETAIL_OPTIONS: DetailTab[] = ["overview", "early", "mid", "late"];

function humanizeToken(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanGameText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/%i:[^%]*%/g, "")
    .replace(/@([^@]+)@(?:st|nd|rd|th)?/g, (_, token: string) => humanizeToken(token))
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildInspectorModel(
  dataset: Dataset,
  inspector: InspectorTarget
): {
  title: string;
  subtitle?: string;
  body: string;
  chips: string[];
  icon: string;
  accent: string;
  unlockCondition?: string | null;
} | null {
  if (!inspector) {
    return null;
  }

  if (inspector.kind === "champion") {
    const champion = dataset.championsById[inspector.id];
    if (!champion) {
      return null;
    }
    return {
      title: champion.name,
      subtitle: champion.abilityName,
      body: cleanGameText(champion.abilityDesc) || "No champion ability description was captured.",
      chips: champion.traitIds.map((traitId) => dataset.synergiesById[traitId]?.name ?? traitId),
      icon: champion.icon,
      accent: `Cost ${champion.cost}`,
      unlockCondition: champion.requiresUnlock ? champion.unlockCondition : null
    };
  }

  const augment = dataset.augmentsById[inspector.id];
  if (!augment) {
    return null;
  }

  return {
    title: augment.name,
    body: cleanGameText(augment.description) || "No augment description was captured.",
    chips: [augment.tier],
    icon: augment.icon,
    accent: `${augment.tier} tier`
  };
}

function renderChampionTile(
  slotKey: number,
  champion: Champion | undefined,
  onHoverChampion: (id: string | null) => void,
  onToggleLock: (target: InspectorTarget) => void
) {
  if (!champion) {
    return (
      <div key={slotKey} className="board-slot empty">
        <div className="board-slot-shell" />
      </div>
    );
  }

  return (
    <button
      key={slotKey}
      type="button"
      className={`board-slot filled cost-${champion.cost}`}
      aria-label={`Inspect champion ${champion.name}`}
      onMouseEnter={() => onHoverChampion(champion.id)}
      onMouseLeave={() => onHoverChampion(null)}
      onClick={() => onToggleLock({ kind: "champion", id: champion.id })}
    >
      <div className="board-slot-shell">
        <div className="champ-frame">
          <img src={champion.icon} alt={champion.name} className="champ-icon" />
        </div>
      </div>
      {champion.requiresUnlock ? (
        <span
          className="board-unlock-badge"
          title={champion.unlockCondition ?? `${champion.name} must be unlocked before purchase.`}
        >
          <img src="/assets/system/lock.svg" alt="" className="board-unlock-icon" />
        </span>
      ) : null}
    </button>
  );
}

function renderAugment(
  augment: Augment | undefined,
  onHoverAugment: (id: string | null) => void,
  onToggleLock: (target: InspectorTarget) => void
) {
  if (!augment) {
    return null;
  }

  return (
    <button
      key={augment.id}
      type="button"
      className={`augment-card named-card tier-${augment.tier.toLowerCase()}`}
      aria-label={`Inspect augment ${augment.name}`}
      title={augment.name}
      onMouseEnter={() => onHoverAugment(augment.id)}
      onMouseLeave={() => onHoverAugment(null)}
      onClick={() => onToggleLock({ kind: "augment", id: augment.id })}
    >
      <img src={augment.icon} alt={augment.name} className="augment-icon" />
      <div className="augment-copy">
        <span className="augment-name">{augment.name}</span>
        <span className="augment-rank">{augment.tier}</span>
      </div>
    </button>
  );
}

function parseLevellingGuideLine(line: string) {
  const match = line.match(
    /^Level\s+(?<level>\d+)\s+at\s+(?<stage>\d-\d)\s+with\s+(?<gold>\d+\+\s+gold)(?:\s+—\s+(?<note>.+))?$/i
  );

  if (!match?.groups) {
    return null;
  }

  return {
    level: match.groups.level,
    stage: match.groups.stage,
    gold: match.groups.gold,
    note: match.groups.note?.trim() ?? null
  };
}

type LevellingGuideEntry = NonNullable<ReturnType<typeof parseLevellingGuideLine>>;

function renderDefaultGuideSection(section: Comp["guide"]["overview"][number], selectedTab: DetailTab) {
  return (
    <article key={`${selectedTab}-${section.title}`} className="guide-card">
      <div className="guide-card-header">
        <h3>{section.title}</h3>
      </div>
      <div className="guide-card-body">
        {section.lines.map((line) => (
          <p key={`${section.title}-${line}`} className="guide-line">
            {line}
          </p>
        ))}
      </div>
    </article>
  );
}

function renderGuideSection(section: Comp["guide"]["overview"][number], selectedTab: DetailTab) {
  if (section.title === "General info") {
    return (
      <article key={`${selectedTab}-${section.title}`} className="guide-card compact-guide-card">
        <div className="guide-card-header">
          <h3>{section.title}</h3>
        </div>
        <div className="guide-card-body compact-guide-body">
          <p className="guide-summary">{section.lines.join(" ")}</p>
        </div>
      </article>
    );
  }

  if (section.title === "When to make") {
    return (
      <article key={`${selectedTab}-${section.title}`} className="guide-card compact-guide-card">
        <div className="guide-card-header">
          <h3>{section.title}</h3>
        </div>
        <div className="guide-tag-list">
          {section.lines.map((line) => (
            <span key={`${section.title}-${line}`} className="guide-tag">
              {line}
            </span>
          ))}
        </div>
      </article>
    );
  }

  if (section.title === "How to play") {
    const styleLine = section.lines.find((line) => line.startsWith("Style: "));
    const styleValue = styleLine?.replace(/^Style:\s*/i, "").trim();
    const bodyLines = section.lines.filter((line) => line !== styleLine);

    return (
      <article key={`${selectedTab}-${section.title}`} className="guide-card compact-guide-card">
        <div className="guide-card-header">
          <h3>{section.title}</h3>
        </div>
        <div className="guide-card-body compact-guide-body">
          {styleValue ? <span className="guide-tag guide-tag-strong">{styleValue}</span> : null}
          {bodyLines.map((line) => (
            <p key={`${section.title}-${line}`} className="guide-summary">
              {line}
            </p>
          ))}
        </div>
      </article>
    );
  }

  if (section.title !== "Levelling guide") {
    return renderDefaultGuideSection(section, selectedTab);
  }

  const entries = section.lines
    .map(parseLevellingGuideLine)
    .filter((entry): entry is LevellingGuideEntry => Boolean(entry));

  if (!entries.length) {
    return renderDefaultGuideSection(section, selectedTab);
  }

  return (
    <article key={`${selectedTab}-${section.title}`} className="guide-card levelling-guide-card">
      <div className="guide-card-header">
        <h3>{section.title}</h3>
      </div>
      <div className="level-guide-list">
        {entries.map((entry) => (
          <div key={`${section.title}-${entry.level}-${entry.stage}`} className="level-guide-step">
            <div className="level-guide-step-head">
              <div className="level-guide-level">L{entry.level}</div>
              {entry.note ? <p className="level-guide-note">{entry.note}</p> : null}
            </div>
            <div className="level-guide-detail">
              <div className="level-guide-meta">
                <span className="level-guide-pill">{entry.stage}</span>
                <span className="level-guide-pill muted">{entry.gold}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function DetailPane({
  comp,
  dataset,
  activePhase,
  selectedTab,
  onActivePhaseChange,
  onSelectTab,
  inspector,
  lockedInspector,
  onHoverChampion,
  onHoverAugment,
  onToggleLock,
  onQuickFilter
}: DetailPaneProps) {
  const phase = comp.phases[activePhase];
  const activeInspector = buildInspectorModel(dataset, lockedInspector ?? inspector);
  const boardCells = phase.boardSlots.map((slot, slotIndex) => {
    const row = Math.floor(slotIndex / 7);
    const column = slotIndex % 7;

    return {
      slot,
      style: {
        left:
          row % 2 === 1
            ? `calc(${column} * (var(--hex-width) + var(--hex-gap-x)) + (var(--hex-width) / 2) + (var(--hex-gap-x) / 2))`
            : `calc(${column} * (var(--hex-width) + var(--hex-gap-x)))`,
        top: `calc(${row} * ((var(--hex-height) * 0.75) + var(--hex-gap-y)))`
      } satisfies React.CSSProperties
    };
  });
  const synergyCounts = phase.boardSlots.reduce<Record<string, number>>((counts, slot) => {
    if (!slot.championId) {
      return counts;
    }

    const champion = dataset.championsById[slot.championId];
    for (const traitId of champion?.traitIds ?? []) {
      counts[traitId] = (counts[traitId] ?? 0) + 1;
    }

    return counts;
  }, {});
  const guideSections = selectedTab === "overview" ? comp.guide.overview : comp.guide.phases[selectedTab];

  return (
    <div className="detail-embedded">
      <div className="detail-toolbar">
        <div className="segmented-control phase-tabs">
          {DETAIL_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === selectedTab ? "segment active" : "segment"}
              aria-label={option === "overview" ? `Show overview for ${comp.title}` : `Show ${option} board for ${comp.title}`}
              onClick={() => {
                onSelectTab(option);
                if (option !== "overview") {
                  onActivePhaseChange(option);
                }
              }}
            >
              {option}
            </button>
          ))}
        </div>
        <a href={comp.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
          Open source guide
        </a>
      </div>

      <div className="detail-grid">
        <div className="detail-main-card">
          <div className="section-header">
            <h3>Board view</h3>
            <p>
              {activePhase} board · {phase.championIds.length} units
            </p>
          </div>
          <div className="board-stage">
            <div className="board-grid">
              {boardCells.map(({ slot, style }) => {
                const champion = slot.championId ? dataset.championsById[slot.championId] : undefined;
                return (
                  <div key={slot.index} className="board-cell" style={style}>
                    {renderChampionTile(slot.index, champion, onHoverChampion, onToggleLock)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="detail-side-stack">
          <div className="guide-panel">
            <div className="section-header">
              <h3>{selectedTab === "overview" ? "Overview" : `${selectedTab} plan`}</h3>
              <p>Mobalytics guide notes</p>
            </div>
            {guideSections.length > 0 ? (
              <div className={selectedTab === "overview" ? "guide-section-grid overview-grid" : "guide-section-grid phase-grid"}>
                {guideSections.map((section) => renderGuideSection(section, selectedTab))}
              </div>
            ) : (
              <div className="guide-empty">
                <p className="quiet-copy">Guide notes for this section were not available from Mobalytics.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="inspector-card detail-full-inspector">
        <div className="section-header">
          <h3>Inspector</h3>
          <p>{lockedInspector ? "Pinned" : "Live hover preview"}</p>
        </div>
        {activeInspector ? (
          <div className="inspector-body">
            <div className="inspector-head">
              <img src={activeInspector.icon} alt={activeInspector.title} className="inspector-icon" />
              <div className="inspector-copy">
                <span className="accent-pill">{activeInspector.accent}</span>
                <h4 data-testid="inspector-title">{activeInspector.title}</h4>
                {activeInspector.subtitle ? <p className="inspector-subtitle">{activeInspector.subtitle}</p> : null}
              </div>
            </div>
            <div className="inspector-content">
              <div className="mini-chip-row wrap">
                {activeInspector.chips.map((chip) => (
                  <span key={chip} className="mini-chip muted">
                    {chip}
                  </span>
                ))}
              </div>
              {activeInspector.unlockCondition ? (
                <div className="unlock-callout">
                  <img src="/assets/system/lock.svg" alt="" className="unlock-callout-icon" />
                  <div>
                    <p className="unlock-callout-label">Unlock before purchase</p>
                    <p className="unlock-callout-copy">{activeInspector.unlockCondition}</p>
                  </div>
                </div>
              ) : null}
              <p className="inspector-body-copy">{activeInspector.body}</p>
            </div>
          </div>
        ) : (
          <p className="quiet-copy">
            Hover a unit or augment to preview it here. Click one to keep it pinned while you compare phases.
          </p>
        )}
      </div>

      <div className="detail-support-grid">
        <div className="detail-card detail-card-inline">
          <div className="section-header">
            <h3>Synergies</h3>
            <p>Click an icon to filter</p>
          </div>
          <div className="token-grid icon-grid support-token-grid">
            {phase.synergyIds.map((synergyId) => {
              const synergy = dataset.synergiesById[synergyId];
              return (
                <button
                  key={synergyId}
                  type="button"
                  className="token-button synergy-card"
                  title={synergy?.name ?? synergyId}
                  aria-label={`Filter by ${synergy?.name ?? synergyId}`}
                  onClick={() => onQuickFilter(synergy?.name ?? synergyId)}
                >
                  <img src={synergy?.icon} alt={synergy?.name ?? synergyId} className="token-icon" />
                  <span className="synergy-name">{synergy?.name ?? synergyId}</span>
                  <span className="synergy-count">{synergyCounts[synergyId] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="detail-card detail-card-inline">
          <div className="section-header">
            <h3>Recommended augments</h3>
            <p>Hover to preview, click to pin</p>
          </div>
          <div className="augment-grid icon-grid support-augment-grid">
            {comp.recommendedAugmentIds.map((augmentId) =>
              renderAugment(dataset.augmentsById[augmentId], onHoverAugment, onToggleLock)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
