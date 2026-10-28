import type { Discipline, DrawType, GameScore, MatchStatus } from "@/db/schema";

// Every source maps its data into these shapes; upsert.ts writes them.

export type NTournament = {
  externalId: string;
  name: string;
  tier: string;
  city?: string | null;
  country?: string | null;
  venue?: string | null;
  timezone: string;
  startDate: string;
  endDate: string;
  statusOverride?: string | null;
  prizeMoney?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
};

export type NPlayer = {
  externalId: string;
  name: string;
  lastName?: string | null;
  country?: string | null;
  gender?: "M" | "F" | null;
  photoUrl?: string | null;
};

export type NSide = {
  side: 1 | 2;
  players: NPlayer[];
  seed?: string | null;
};

export type NMatch = {
  externalId: string;
  tournamentExternalId: string;
  discipline: Discipline;
  drawType: DrawType;
  drawSize?: number | null;
  round: string;
  bracketPosition?: number | null;
  court?: string | null;
  scheduledAt?: Date | null;
  status: MatchStatus;
  winnerSide?: 1 | 2 | null;
  games: GameScore[];
  durationMin?: number | null;
  sides: NSide[];
};

export type UpsertStats = Record<string, number>;
