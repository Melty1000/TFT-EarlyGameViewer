type RankBadgeProps = {
  tier: string;
  label: string;
  sourceShort?: string;
};

export function RankBadge({ tier, label, sourceShort }: RankBadgeProps) {
  const normalizedTier = tier.toLowerCase();
  const displayTier = tier.length === 1 ? tier : "?";

  return (
    <span
      className={`rank-chip custom-rank-badge rank-${normalizedTier}${sourceShort ? " with-source" : ""}`}
      title={label}
      aria-label={`Build rank ${label}`}
      data-rank-tier={tier}
    >
      <span className="rank-glyph" aria-hidden="true">
        <span className="rank-glyph-lines" />
        <strong>{displayTier}</strong>
      </span>
      {sourceShort ? <span className="rank-source">{sourceShort}</span> : null}
    </span>
  );
}
