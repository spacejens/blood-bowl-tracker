import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * One position template's characteristics under the rules set its roster's era
 * declares. TP stores all five as plain numbers per lineUp/star master.
 * `passing` is a plain number, never null: TP writes a literal 0 for a position
 * with no passing ability, and every rules set TP covers (BB2020, DB2021,
 * BB2025) does have a Passing characteristic, so no absent-vs-zero branching
 * is needed on the TP side.
 */
export interface TpPositionCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

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
  characteristics: TpPositionCharacteristics;
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
  /**
   * TP's per-action-type career counters, or `undefined` when the source entry
   * carried none. Only a standalone `rosters_<id>.json` entry has them: the
   * match-embedded roster snapshots `MatchParserService` parses through the
   * same `LineUpSchema` do not, which is why every counter field is optional.
   */
  careerCounts?: TpCareerSppCounts;
}

/**
 * TP's career-wide, per-action-type counters for one player, from a standalone
 * `rosters_<id>.json` `lineUps[]` entry. Career-wide in exactly the sense
 * `totalStarPlayerPoints` is: inclusive of competitions that are still ongoing
 * and have not been downloaded/imported locally yet.
 *
 * TP's raw JSON has NO deflection field, so `interceptions`
 * (`totalInterceptions`) is a COMBINED interception+deflection figure, and no
 * casualty-severity breakdown, so `casualties` (`totalCasualties`) covers every
 * severity. Both are carried through as the combined counters they are; the
 * consumer prices each with a single representative award value -- see
 * docs/plans/2026-08-13-tp-spp-ongoing-competition-adjustment-design.md,
 * "Known limitations".
 */
export interface TpCareerSppCounts {
  touchdowns: number;
  completions: number;
  interceptions: number;
  mvpAwards: number;
  casualties: number;
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

const CharacteristicsFields = {
  ma: z.number().int(),
  st: z.number().int(),
  ag: z.number().int(),
  pa: z.number().int(),
  av: z.number().int(),
};

const LineUpMasterSchema = z.object({
  id: z.number(),
  position: z.string(),
  ...CharacteristicsFields,
});

const StarPlayerMasterSchema = z.object({
  id: z.number(),
  position: z.string(),
  ...CharacteristicsFields,
});

export const LineUpSchema = z.object({
  id: z.number(),
  name: z.string(),
  number: z.number(),
  lineUpMasterId: z.number(),
  rosterId: z.number(),
  position: z.string(),
  isBigGuy: z.boolean().optional(),
  totalStarPlayerPoints: z.number().int(),
  // Optional because match-embedded roster snapshots reuse this schema (see
  // MatchLineUpSchema) and carry none of these counters. Nonnegative to match
  // SppCareerCountsSchema (packages/api-contract), which TpSppAdjustmentsImportService
  // forwards these values into — a negative counter here would otherwise pass
  // parsing only to reject the whole sync chunk downstream.
  totalTouchdowns: z.number().int().nonnegative().optional(),
  totalPass: z.number().int().nonnegative().optional(),
  totalInterceptions: z.number().int().nonnegative().optional(),
  totalMVP: z.number().int().nonnegative().optional(),
  totalCasualties: z.number().int().nonnegative().optional(),
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
        characteristics: this.characteristics(entry),
      })),
      starPositions: data.rosterMaster.starPlayersMasters.map((entry) => ({
        tpPositionId: entry.id,
        name: entry.position,
        characteristics: this.characteristics(entry),
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
        careerCounts: this.careerCounts(entry),
      })),
    };
  }

  /**
   * The entry's per-action-type career counters, or `undefined` when it does
   * not carry the full set. All-or-nothing on purpose: a partial set would
   * silently under-count one action type and inflate the SPP left unexplained,
   * which is the exact failure this data exists to prevent.
   */
  private careerCounts(
    entry: z.infer<typeof LineUpSchema>,
  ): TpCareerSppCounts | undefined {
    const {
      totalTouchdowns,
      totalPass,
      totalInterceptions,
      totalMVP,
      totalCasualties,
    } = entry;
    if (
      totalTouchdowns === undefined ||
      totalPass === undefined ||
      totalInterceptions === undefined ||
      totalMVP === undefined ||
      totalCasualties === undefined
    ) {
      return undefined;
    }
    return {
      touchdowns: totalTouchdowns,
      completions: totalPass,
      interceptions: totalInterceptions,
      mvpAwards: totalMVP,
      casualties: totalCasualties,
    };
  }

  /** The five characteristics carried on every lineUp/star master entry. */
  private characteristics(entry: {
    ma: number;
    st: number;
    ag: number;
    pa: number;
    av: number;
  }): TpPositionCharacteristics {
    return {
      move: entry.ma,
      strength: entry.st,
      agility: entry.ag,
      passing: entry.pa,
      armour: entry.av,
    };
  }
}
