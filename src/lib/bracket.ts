export type BracketMatch = {
  id: number;
  roundIndex: number;
  bracketPosition: number | null;
  winnerSide: number | null;
  sides: { side: number; players: { id: number }[] }[];
};

const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");

/**
 * Orders a knockout draw into columns, first round first. Each column is padded
 * with nulls so it holds exactly half the previous one, which keeps the tree
 * shape intact while later rounds are still unknown.
 *
 * When a source gives bracket positions they're used as-is. Otherwise the order is
 * rebuilt from progression: each match's two feeder matches are the earlier-round
 * matches won by the players on its side 1 and side 2.
 */
export function orderBracket<T extends BracketMatch>(list: T[]): (T | null)[][] {
  if (!list.length) return [];
  const byRound = new Map<number, T[]>();
  for (const m of list) byRound.set(m.roundIndex, [...(byRound.get(m.roundIndex) ?? []), m]);
  const indices = [...byRound.keys()].sort((a, b) => a - b);
  const byDefault = (a: T, b: T) =>
    (a.bracketPosition ?? Number.MAX_SAFE_INTEGER) - (b.bracketPosition ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;
  const columns = indices.map((i) => [...(byRound.get(i) ?? [])].sort(byDefault));

  const positioned = list.every((m) => m.bracketPosition !== null);
  if (!positioned) {
    for (let r = columns.length - 1; r > 0; r--) {
      const prev = columns[r - 1];
      const winners = new Map<string, T>();
      for (const m of prev) {
        const w = m.sides.find((s) => s.side === m.winnerSide);
        if (w?.players.length) winners.set(key(w.players.map((p) => p.id)), m);
      }
      const ordered: T[] = [];
      for (const m of columns[r]) {
        for (const sideNo of [1, 2]) {
          const s = m.sides.find((x) => x.side === sideNo);
          const feeder = s?.players.length ? winners.get(key(s.players.map((p) => p.id))) : undefined;
          if (feeder && !ordered.includes(feeder)) ordered.push(feeder);
        }
      }
      columns[r - 1] = [...ordered, ...prev.filter((m) => !ordered.includes(m))];
    }
  }

  // Pad to a power-of-two tree based on the first round's size.
  const first = 2 ** Math.ceil(Math.log2(Math.max(1, columns[0].length)));
  const expected = (r: number) => Math.max(1, first / 2 ** r);
  const rounds = Math.round(Math.log2(first)) + 1;
  const out: (T | null)[][] = [];
  for (let r = 0; r < Math.max(rounds, columns.length); r++) {
    const col: (T | null)[] = [];
    const src = columns[r] ?? [];
    const size = expected(r);
    for (let i = 0; i < size; i++) {
      const placed = positioned ? src.find((m) => m.bracketPosition === i) : src[i];
      col.push(placed ?? null);
    }
    out.push(col);
  }
  return out;
}
