import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * One position on a race's roster, from a `rosterMaster.lineUpMasters[]` entry.
 * `tpPositionId` is TP's internal line-up-master id: stable per
 * `(teamRace code, position name)` pair, but NOT stable across the rule-set
 * variant codes of one logical race (e.g. "Dwarf Blocker Lineman" id 280 under
 * `Dwarf` vs "Dwarf Lineman" id 952 under `Dwarf_BB2025`).
 */
export interface TpRosterPosition {
  tpPositionId: number;
  name: string;
}

/**
 * One player instance on a team's roster, from a `lineUps[]` entry. `id` is the
 * per-instance line-up id that `matchEvents[].lineUpId` references; `rosterId`
 * matches the roster's top-level `id`; `lineUpMasterId` links to the position
 * template in `rosterMaster.lineUpMasters[]` (or `starPlayersMasters[]`).
 * `fallbackPositionName` and `isBigGuy` are also carried inline on every
 * `lineUps[]` entry -- unlike a regular or star position, a mercenary Big Guy
 * hire (e.g. "Giant") has no catalog entry in either `rosterMaster` array at
 * all, so `lineUpMasterId` never resolves for one. `TpPlayersImportService`
 * falls back to `fallbackPositionName` (gated on `isBigGuy`) to still import
 * such a player, reusing an `isStarPlayer: true` Position the same way a star
 * player does.
 */
export interface TpRosterPlayer {
  id: number;
  name: string;
  number: number;
  lineUpMasterId: number;
  rosterId: number;
  fallbackPositionName: string;
  isBigGuy: boolean;
  /**
   * TP's own reported CAREER Star Player Points total for this player
   * (`lineUps[].totalStarPlayerPoints`). Distinct from the sibling
   * `starPlayerPoints` field, which is the unspent figure and was
   * investigated and rejected as an SPP ground truth -- see
   * tools/import-tp/src/match-events/tp-spp-cross-check.spec.ts.
   */
  totalStarPlayerPoints: number;
}

/**
 * The parsed top-level `rosters_<id>.json` body. `teamRaceCode` is the raw
 * `teamRace` code (may carry a rule-set suffix and is NOT one-per-logical-race);
 * `raceName` is `rosterMaster.name`, the display name stable across every code
 * variant of the same logical race. Only these fields are extracted -- stats,
 * skills, quantities and costs are ignored; `rosterMaster.starPlayersMasters`
 * (named star players permanently on the roster) is parsed into `starPositions`.
 */
export interface TpRoster {
  id: number;
  teamName: string;
  teamRaceCode: string;
  raceName: string;
  coachTpId: string;
  positions: TpRosterPosition[];
  starPositions: TpRosterPosition[];
  players: TpRosterPlayer[];
}

const LineUpMasterSchema = z.object({
  id: z.number(),
  position: z.string(),
});

const StarPlayerMasterSchema = z.object({
  id: z.number(),
  position: z.string(),
});

export const LineUpSchema = z.object({
  id: z.number(),
  name: z.string(),
  number: z.number(),
  lineUpMasterId: z.number(),
  rosterId: z.number(),
  position: z.string(),
  isBigGuy: z.boolean().optional(),
  totalStarPlayerPoints: z.number(),
});

const RosterSchema = z.object({
  id: z.number(),
  teamName: z.string(),
  teamRace: z.string(),
  player: z.object({
    applicationUserId: z.string(),
  }),
  lineUps: z.array(LineUpSchema),
  rosterMaster: z.object({
    name: z.string(),
    starPlayersMasters: z.array(StarPlayerMasterSchema),
    lineUpMasters: z.array(LineUpMasterSchema),
  }),
});

@Injectable()
export class RosterParserService {
  /**
   * Validate and flatten a parsed TP `rosters_<id>.json` body into a `TpRoster`.
   * Extra fields (stats/skills/costs) are allowed and dropped by zod's default
   * non-strict parsing. Throws an Error whose message names the failing field on
   * any shape mismatch.
   */
  parse(content: unknown): TpRoster {
    const result = RosterSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP roster JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    const data = result.data;
    return {
      id: data.id,
      teamName: data.teamName,
      teamRaceCode: data.teamRace,
      raceName: data.rosterMaster.name,
      coachTpId: data.player.applicationUserId,
      positions: data.rosterMaster.lineUpMasters.map((entry) => ({
        tpPositionId: entry.id,
        name: entry.position,
      })),
      starPositions: data.rosterMaster.starPlayersMasters.map((entry) => ({
        tpPositionId: entry.id,
        name: entry.position,
      })),
      players: data.lineUps.map((entry) => ({
        id: entry.id,
        name: entry.name,
        number: entry.number,
        lineUpMasterId: entry.lineUpMasterId,
        rosterId: entry.rosterId,
        fallbackPositionName: entry.position,
        isBigGuy: entry.isBigGuy ?? false,
        totalStarPlayerPoints: entry.totalStarPlayerPoints,
      })),
    };
  }
}
