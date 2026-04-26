import { useState } from "react";
import type { Augment, Champion, Comp, Dataset, Synergy } from "../../shared/tft";
import type { PhaseKey } from "../../shared/normalization";
import { getCompPlaystyle, getCompRankTags, getPlaystyleIcon, getPlaystyleLabel, getRankIcon } from "../lib/compMeta";
import { getItemDisplay } from "../lib/items";

export type InspectorTarget =
  | { kind: "champion"; id: string }
  | { kind: "augment"; id: string }
  | { kind: "synergy"; id: string }
  | { kind: "item"; id: string }
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
  onHoverSynergy: (id: string | null) => void;
  onHoverItem: (id: string | null) => void;
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
  comp: Comp,
  dataset: Dataset,
  activePhase: PhaseKey,
  inspector: InspectorTarget
): {
  title: string;
  subtitle?: string;
  body: string;
  chips: string[];
  icon: string;
  accent: string;
  unlockCondition?: string | null;
  recommendedItems?: ReturnType<typeof getItemDisplay>[];
  recipe?: ReturnType<typeof getItemDisplay>["recipe"];
} | null {
  if (!inspector) {
    return null;
  }

  if (inspector.kind === "champion") {
    const champion = dataset.championsById[inspector.id];
    if (!champion) {
      return null;
    }
    const itemIds = [
      ...new Set(
        [
          ...comp.phases[activePhase].boardSlots,
          ...comp.phases.late.boardSlots,
          ...comp.phases.mid.boardSlots,
          ...comp.phases.early.boardSlots
        ]
          .filter((slot) => slot.championId === champion.id)
          .flatMap((slot) => slot.itemIds)
      )
    ];
    return {
      title: champion.name,
      subtitle: champion.abilityName,
      body: cleanGameText(champion.abilityDesc) || "No champion ability description was captured.",
      chips: champion.traitIds.map((traitId) => dataset.synergiesById[traitId]?.name ?? traitId),
      icon: champion.icon,
      accent: `Cost ${champion.cost}`,
      unlockCondition: champion.requiresUnlock ? champion.unlockCondition : null,
      recommendedItems: itemIds.map((itemId) => getItemDisplay(dataset, itemId))
    };
  }

  if (inspector.kind === "synergy") {
    const synergy: Synergy | undefined = dataset.synergiesById[inspector.id];
    if (!synergy) {
      return null;
    }
    const breakpointChips = synergy.breakpoints.map((bp) => `${bp.units}`);
    return {
      title: synergy.name,
      body: cleanGameText(synergy.description) || "No trait description was captured.",
      chips: breakpointChips.length ? breakpointChips : ["Trait"],
      icon: synergy.icon,
      accent: "Trait"
    };
  }

  if (inspector.kind === "item") {
    const item = getItemDisplay(dataset, inspector.id);
    return {
      title: item.name,
      body: cleanGameText(item.description) || "No item description was captured.",
      chips: [],
      icon: item.icon,
      accent: "Item",
      recipe: item.recipe
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
  itemIds: string[],
  starLevel: number,
  dataset: Dataset,
  onHoverChampion: (id: string | null) => void,
  onHoverItem: (id: string | null) => void,
  onToggleLock: (target: InspectorTarget) => void,
  onQuickFilter: (label: string) => void
) {
  if (!champion) {
    return (
      <div key={slotKey} className="board-slot empty">
        <div className="board-slot-shell" />
      </div>
    );
  }

  const stars = Math.max(1, Math.min(3, Math.round(starLevel || 1)));

  return (
    <div
      key={slotKey}
      className={`board-slot filled cost-${champion.cost}`}
      onMouseEnter={() => onHoverChampion(champion.id)}
      onMouseLeave={() => onHoverChampion(null)}
    >
      <button
        type="button"
        className="board-slot-trigger"
        aria-label={`Inspect champion ${champion.name}`}
        title={`${champion.name} - click to pin, right-click to filter`}
        onClick={() => onToggleLock({ kind: "champion", id: champion.id })}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onQuickFilter(champion.name);
        }}
      >
        <div className="board-slot-shell">
          <div className="champ-frame">
            <img src={champion.icon} alt={champion.name} className="champ-icon" />
          </div>
        </div>
      </button>
      {stars > 1 ? (
        <span className={`champ-star-badge stars-${stars}`} title={`Target: ${stars}-star`}>
          {"★".repeat(stars)}
        </span>
      ) : null}
      {champion.requiresUnlock ? (
        <span
          className="board-unlock-badge"
          title={champion.unlockCondition ?? `${champion.name} must be unlocked before purchase.`}
        >
          <img src={`${import.meta.env.BASE_URL}assets/system/lock.svg`} alt="" className="board-unlock-icon" />
        </span>
      ) : null}
      {itemIds.length > 0 ? (
        <div className="board-item-strip">
          {itemIds.slice(0, 3).map((itemId, index) => {
            const item = getItemDisplay(dataset, itemId);
            return (
              <button
                key={`${itemId}-${index}`}
                type="button"
                className={`board-item-icon item-slot-${index + 1}`}
                title={`${item.name} - click to pin, right-click to filter`}
                aria-label={`Inspect item ${item.name}`}
                onMouseEnter={() => onHoverItem(itemId)}
                onMouseLeave={() => onHoverItem(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleLock({ kind: "item", id: itemId });
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onQuickFilter(item.name);
                }}
              >
                <img src={item.icon} alt={item.name} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function renderAugment(
  augment: Augment | undefined,
  onHoverAugment: (id: string | null) => void,
  onToggleLock: (target: InspectorTarget) => void,
  onQuickFilter: (label: string) => void
) {
  if (!augment) {
    return null;
  }

  return (
    <div
      key={augment.id}
      className={`augment-card named-card tier-${augment.tier.toLowerCase()}`}
      title={`${augment.name} - click to pin, right-click to filter`}
      onMouseEnter={() => onHoverAugment(augment.id)}
      onMouseLeave={() => onHoverAugment(null)}
    >
      <button
        type="button"
        className="augment-main-action"
        aria-label={`Inspect augment ${augment.name}`}
        onClick={() => onToggleLock({ kind: "augment", id: augment.id })}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onQuickFilter(augment.name);
        }}
      >
        <img src={augment.icon} alt={augment.name} className="augment-icon" />
        <div className="augment-copy">
          <span className="augment-name">{augment.name}</span>
          <span className="augment-rank">{augment.tier}</span>
        </div>
      </button>
    </div>
  );
}

function parseLevellingGuideLine(line: string) {
  const match = line.match(/\blevel\s+(?<level>\d+)\b/i);

  if (!match?.groups) {
    return null;
  }

  const stage = line.match(/\b(?:at|through)\s+(?<stage>\d-\d)\b/i)?.groups?.stage ?? "";
  const gold = line.match(/\b(?<gold>\d+\+\s+gold)\b/i)?.groups?.gold ?? "";
  const note = line
    .replace(/^.*?\blevel\s+\d+\b/i, "")
    .replace(/\b(?:at|through)\s+\d-\d\b/i, "")
    .replace(/\bwith\s+\d+\+\s+gold\b/i, "")
    .replace(/\b\d+\+\s+gold\b/i, "")
    .replace(/^[\s—-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    level: match.groups.level,
    stage,
    gold,
    note: note || null
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
    const styleIcon = getPlaystyleIcon(styleValue ?? null);
    const styleLabel = getPlaystyleLabel(styleValue ?? null);
    const bodyLines = section.lines.filter((line) => line !== styleLine);

    return (
      <article key={`${selectedTab}-${section.title}`} className="guide-card compact-guide-card">
        <div className="guide-card-header">
          <h3>{section.title}</h3>
        </div>
        <div className="guide-card-body compact-guide-body">
          {styleLabel ? (
            <span className="guide-tag guide-tag-strong" title={styleValue}>
              {styleIcon ? <img src={styleIcon} alt="" className="style-cell-icon" /> : null}
              {styleLabel}
            </span>
          ) : null}
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

  const parsedLines = section.lines.map((line) => ({ line, entry: parseLevellingGuideLine(line) }));
  const entries = parsedLines
    .map(({ entry }) => entry)
    .filter((entry): entry is LevellingGuideEntry => Boolean(entry));
  const extraLines = parsedLines.filter(({ entry }) => !entry).map(({ line }) => line);

  if (!entries.length) {
    return renderDefaultGuideSection(section, selectedTab);
  }

  return (
    <article key={`${selectedTab}-${section.title}`} className="guide-card levelling-guide-card">
      <div className="guide-card-header">
        <h3>{section.title}</h3>
      </div>
      <div className="level-guide-timeline">
        {entries.map((entry) => (
          <div key={`${section.title}-${entry.level}-${entry.stage}`} className="level-guide-step">
            <div className="level-guide-node" aria-hidden="true" />
            <div className="level-guide-level">L{entry.level}</div>
            <div className="level-guide-detail">
              <div className="level-guide-meta">
                {entry.stage ? <span className="level-guide-pill">{entry.stage}</span> : null}
                {entry.gold ? <span className="level-guide-pill muted">{entry.gold}</span> : null}
              </div>
              {entry.note ? <p className="level-guide-note">{entry.note}</p> : null}
            </div>
          </div>
        ))}
      </div>
      {extraLines.length ? (
        <div className="level-guide-extra">
          {extraLines.map((line) => (
            <p key={`${section.title}-${line}`}>{line}</p>
          ))}
        </div>
      ) : null}
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
  onHoverSynergy,
  onHoverItem,
  onToggleLock,
  onQuickFilter
}: DetailPaneProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const phase = comp.phases[activePhase];
  const activeInspector = buildInspectorModel(comp, dataset, activePhase, lockedInspector ?? inspector);
  const rankTags = getCompRankTags(comp);
  const playstyle = getCompPlaystyle(comp);
  const playstyleIcon = getPlaystyleIcon(playstyle);
  const playstyleLabel = getPlaystyleLabel(playstyle);
  const filledBoardSlotCount = phase.boardSlots.filter((slot) => slot.championId).length;
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
  const synergyCounts = phase.championIds.reduce<Record<string, number>>((counts, championId) => {
    const champion = dataset.championsById[championId];
    for (const traitId of champion?.traitIds ?? []) {
      counts[traitId] = (counts[traitId] ?? 0) + 1;
    }

    return counts;
  }, {});
  const guideSections = selectedTab === "overview" ? comp.guide.overview : comp.guide.phases[selectedTab];

  return (
    <div className="detail-embedded">
      <div className="detail-toolbar">
        <div className="detail-tab-cluster">
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
          <div className="expanded-build-meta">
            {playstyleLabel ? (
              <span className="style-chip large" title={playstyle ?? undefined}>
                {playstyleIcon ? <img src={playstyleIcon} alt="" className="style-chip-icon" /> : null}
                {playstyleLabel}
              </span>
            ) : null}
            {rankTags.slice(0, 4).map((rank) => (
              <span
                key={rank.key}
                className={`rank-chip rank-${rank.tier.toLowerCase()}`}
                title={rank.label}
                aria-label={`Build rank ${rank.label}`}
              >
                <img src={getRankIcon(rank.tier)} alt="" className="rank-icon" aria-hidden="true" />
                <span className="rank-source">{rank.sourceShort}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="detail-toolbar-actions">
          {comp.teamCode ? (
            <button
              type="button"
              className={`copy-code-btn${copyState === "copied" ? " is-copied" : ""}${copyState === "error" ? " is-error" : ""}`}
              aria-label="Copy team code to clipboard"
              title={comp.teamCode}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(comp.teamCode ?? "");
                  setCopyState("copied");
                } catch {
                  setCopyState("error");
                }
                setTimeout(() => setCopyState("idle"), 1500);
              }}
            >
              {copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy code"}
            </button>
          ) : null}
          <a href={comp.sourceUrl} target="_blank" rel="noreferrer" className="source-link">
            Open source guide
          </a>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main-card">
          <div className="section-header">
            <h3>Board view</h3>
            <p>
              {activePhase} board · {filledBoardSlotCount} units
            </p>
          </div>
          <div className="board-stage">
            <div className="board-grid">
              {boardCells.map(({ slot, style }) => {
                const champion = slot.championId ? dataset.championsById[slot.championId] : undefined;
                const starLevel = champion ? slot.starLevel ?? phase.championLevels?.[champion.id] ?? 1 : 1;
                return (
                  <div key={slot.index} className="board-cell" style={style}>
                    {renderChampionTile(
                      slot.index,
                      champion,
                      slot.itemIds ?? [],
                      starLevel,
                      dataset,
                      onHoverChampion,
                      onHoverItem,
                      onToggleLock,
                      onQuickFilter
                    )}
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

      <div className="detail-support-grid">
        <div className="detail-card detail-card-inline">
          <div className="section-header">
            <h3>Synergies</h3>
            <p>Hover for info - click to pin - right-click to filter</p>
          </div>
          <div className="token-grid icon-grid support-token-grid">
            {phase.synergyIds.map((synergyId) => {
              const synergy = dataset.synergiesById[synergyId];
              const displayName = synergy?.name ?? synergyId;
              return (
                <button
                  key={synergyId}
                  type="button"
                  className="token-button synergy-card"
                  title={`${displayName} - click to pin, right-click to filter`}
                  aria-label={`Inspect synergy ${displayName}`}
                  onMouseEnter={() => onHoverSynergy(synergyId)}
                  onMouseLeave={() => onHoverSynergy(null)}
                  onClick={() => onToggleLock({ kind: "synergy", id: synergyId })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onQuickFilter(displayName);
                  }}
                >
                  <img src={synergy?.icon} alt={displayName} className="token-icon" />
                  <span className="synergy-name">{displayName}</span>
                  <span className="synergy-count">{synergyCounts[synergyId] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="detail-card detail-card-inline">
          <div className="section-header">
            <h3>Recommended augments</h3>
            <p>Hover for info - click to pin - right-click to filter</p>
          </div>
          <div className="augment-grid icon-grid support-augment-grid">
            {comp.recommendedAugmentIds.map((augmentId) =>
              renderAugment(dataset.augmentsById[augmentId], onHoverAugment, onToggleLock, onQuickFilter)
            )}
          </div>
        </div>
      </div>

      <div className={activeInspector ? "inspector-card detail-full-inspector has-inspector" : "inspector-card detail-full-inspector is-empty"}>
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
              {activeInspector.chips.length > 0 ? (
                <div className="mini-chip-row wrap">
                  {activeInspector.chips.map((chip) => (
                    <span key={chip} className="mini-chip muted">
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
              {activeInspector.unlockCondition ? (
                <div className="unlock-callout">
                  <img src={`${import.meta.env.BASE_URL}assets/system/lock.svg`} alt="" className="unlock-callout-icon" />
                  <div>
                    <p className="unlock-callout-label">Unlock before purchase</p>
                    <p className="unlock-callout-copy">{activeInspector.unlockCondition}</p>
                  </div>
                </div>
              ) : null}
              {activeInspector.recommendedItems?.length ? (
                <div className="inspector-section">
                  <h5>Recommended items</h5>
                  <div className="inspector-item-grid">
                    {activeInspector.recommendedItems.map((item) => (
                      <div key={item.id} className="inspector-item-card">
                        <img src={item.icon} alt={item.name} className="inspector-item-icon" />
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {activeInspector.recipe?.length ? (
                <div className="inspector-section">
                  <h5>Recipe</h5>
                  <div className="recipe-row">
                    {activeInspector.recipe.map((component, index) => (
                      <div key={`${component.id}-${index}`} className="recipe-component-wrap">
                        {index > 0 ? <span className="recipe-plus" aria-hidden="true">+</span> : null}
                        <span className="recipe-component" aria-label={`Recipe component ${component.name}`}>
                          <img src={component.icon} alt={component.name} className="recipe-icon" />
                          <span>{component.name}</span>
                        </span>
                      </div>
                    ))}
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
    </div>
  );
}
