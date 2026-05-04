import { PHASES, type PhaseKey } from "./normalization";
import type { Comp, PhaseData } from "./tft";

type BoardPhaseComp = Pick<Comp, "phases" | "sources">;

function isPhaseKey(value: unknown): value is PhaseKey {
  return typeof value === "string" && PHASES.includes(value as PhaseKey);
}

export function phaseHasBoardData(phase: PhaseData) {
  return phase.championIds.length > 0 || phase.boardSlots.some((slot) => Boolean(slot.championId));
}

export function getProviderBoardEvidencePhases(comp: Pick<Comp, "sources">): PhaseKey[] {
  const phases = new Set<PhaseKey>();

  for (const source of comp.sources) {
    for (const entry of source.evidence) {
      if (entry.kind === "board" && isPhaseKey(entry.phase)) {
        phases.add(entry.phase);
      }
    }
  }

  return PHASES.filter((phase) => phases.has(phase));
}

export function getNativeBoardPhases(comp: BoardPhaseComp): PhaseKey[] {
  const phasesWithData = PHASES.filter((phase) => phaseHasBoardData(comp.phases[phase]));
  const providerPhases = getProviderBoardEvidencePhases(comp);

  if (!providerPhases.length) {
    return phasesWithData;
  }

  return providerPhases.filter((phase) => phasesWithData.includes(phase));
}

export function hasNativeBoardPhase(comp: BoardPhaseComp, phase: PhaseKey) {
  return getNativeBoardPhases(comp).includes(phase);
}

export function getPreferredBoardPhase(
  comp: BoardPhaseComp,
  requestedPhase: PhaseKey | null | undefined,
  fallbackPhase: PhaseKey = "late"
): PhaseKey {
  const nativePhases = getNativeBoardPhases(comp);

  if (requestedPhase && nativePhases.includes(requestedPhase)) {
    return requestedPhase;
  }

  if (nativePhases.includes(fallbackPhase)) {
    return fallbackPhase;
  }

  return nativePhases[0] ?? fallbackPhase;
}
