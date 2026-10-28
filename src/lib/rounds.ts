// Main-draw rounds keyed by how many players/pairs are left.
const MAIN_ROUNDS: Record<string, number> = {
  R128: 128,
  R64: 64,
  R32: 32,
  R16: 16,
  QF: 8,
  SF: 4,
  F: 2,
};

export const ROUND_LABELS: Record<string, string> = {
  R128: "Round of 128",
  R64: "Round of 64",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarterfinal",
  SF: "Semifinal",
  F: "Final",
  Q1: "Qualifying R1",
  Q2: "Qualifying R2",
  Q3: "Qualifying R3",
};

export function roundLabel(round: string): string {
  return ROUND_LABELS[round] ?? round;
}

// Accepts the many spellings sources use ("Round of 32", "R32", "Quarter final", "Final", "Q-R2").
export function parseRound(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (/^r ?(128|64|32|16)$/.test(s)) return `R${s.replace(/\D/g, "")}`;
  const roundOf = s.match(/^round of (128|64|32|16)$/);
  if (roundOf) return `R${roundOf[1]}`;
  if (/^(qf|quarter ?finals?|quarterfinals?)$/.test(s)) return "QF";
  if (/^(sf|semi ?finals?|semifinals?)$/.test(s)) return "SF";
  if (/^(f|finals?)$/.test(s)) return "F";
  const qual = s.match(/^(?:q ?r? ?|qualif\w* (?:round )?r?)(\d)$/);
  if (qual) return `Q${qual[1]}`;
  return null;
}

export function isQualifyingRound(round: string): boolean {
  return /^Q\d$/.test(round);
}

// Columns sort by this: earlier rounds first, final last.
export function roundIndex(round: string): number {
  if (isQualifyingRound(round)) return Number(round.slice(1)) - 1;
  const left = MAIN_ROUNDS[round];
  return left ? 7 - Math.log2(left) : 99;
}
