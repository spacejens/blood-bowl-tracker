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
 * template in `rosterMaster.lineUpMasters[]`.
 */
export interface TpRosterPlayer {
  id: number;
  name: string;
  number: number;
  lineUpMasterId: number;
  rosterId: number;
}

/**
 * The parsed top-level `rosters_<id>.json` body. `teamRaceCode` is the raw
 * `teamRace` code (may carry a rule-set suffix and is NOT one-per-logical-race);
 * `raceName` is `rosterMaster.name`, the display name stable across every code
 * variant of the same logical race. Only these fields are extracted -- stats,
 * skills, quantities, costs and `starPlayersMasters` are ignored.
 */
export interface TpRoster {
  id: number;
  teamName: string;
  teamRaceCode: string;
  raceName: string;
  coachTpId: string;
  positions: TpRosterPosition[];
  players: TpRosterPlayer[];
}

const LineUpMasterSchema = z.object({
  id: z.number(),
  position: z.string(),
});

const LineUpSchema = z.object({
  id: z.number(),
  name: z.string(),
  number: z.number(),
  lineUpMasterId: z.number(),
  rosterId: z.number(),
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
    lineUpMasters: z.array(LineUpMasterSchema),
  }),
});

@Injectable()
export class RosterParserService {
  /**
   * Validate and flatten a parsed TP `rosters_<id>.json` body into a `TpRoster`.
   * Extra fields (stats/skills/costs/`starPlayersMasters`) are allowed and
   * dropped by zod's default non-strict parsing. Throws an Error whose message
   * names the failing field on any shape mismatch.
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
      players: data.lineUps.map((entry) => ({
        id: entry.id,
        name: entry.name,
        number: entry.number,
        lineUpMasterId: entry.lineUpMasterId,
        rosterId: entry.rosterId,
      })),
    };
  }
}
