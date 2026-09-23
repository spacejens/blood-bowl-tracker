import { z } from 'zod';

import { ImportResultSchema } from './import-result';
import { TeamEraSchema } from './team';

/**
 * A player known only from a match's embedded roster snapshot: a player who
 * has since left the roster is absent from the roster file itself, while
 * match events still name them. Only these fields exist on such an entry.
 */
export const TpMatchEmbeddedPlayerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  number: z.number().int(),
  lineUpMasterId: z.number().int(),
  rosterId: z.number().int(),
  fallbackPositionName: z.string(),
  isBigGuy: z.boolean(),
  totalStarPlayerPoints: z.number(),
});

/** Input of `tpRosters.import`. */
export const ImportTpRosterSchema = z.object({
  /** One TP roster exactly as TP's API returns it; parsed server-side. */
  roster: z.unknown(),
  /** The era to import the team under, by name (its TP external id). */
  era: z.string().min(1),
  /** The name TP's external system is registered under. */
  externalSystemName: z.string().min(1),
  /** This roster's players seen only in match snapshots, if any. */
  matchEmbeddedPlayers: z.array(TpMatchEmbeddedPlayerSchema).default([]),
});

/** One player the import upserted, by TP `lineUps[].id`. */
export const TpImportedPlayerSchema = z.object({
  lineUpId: z.number().int(),
  playerId: z.number().int(),
  created: z.boolean(),
});

/**
 * A mercenary hire's position and the race/era it was hired into. A
 * mercenary appears on no TP catalog, so its race/era availability can only
 * be derived from hires like this one.
 */
export const TpMercenaryPositionUsageSchema = z.object({
  positionId: z.number().int(),
  teamRaceCode: z.string(),
  era: z.string(),
});

/** Output of `tpRosters.import`. */
export const TpRosterImportResultSchema = z.object({
  team: ImportResultSchema,
  players: ImportResultSchema,
  /** Every team era the team has after the import; empty if not imported. */
  teamEras: z.array(TeamEraSchema),
  importedPlayers: z.array(TpImportedPlayerSchema),
  mercenaryPositionUsages: z.array(TpMercenaryPositionUsageSchema),
});

export type TpMatchEmbeddedPlayer = z.infer<typeof TpMatchEmbeddedPlayerSchema>;
export type ImportTpRoster = z.infer<typeof ImportTpRosterSchema>;
export type TpImportedPlayer = z.infer<typeof TpImportedPlayerSchema>;
export type TpMercenaryPositionUsage = z.infer<
  typeof TpMercenaryPositionUsageSchema
>;
export type TpRosterImportResult = z.infer<typeof TpRosterImportResultSchema>;
