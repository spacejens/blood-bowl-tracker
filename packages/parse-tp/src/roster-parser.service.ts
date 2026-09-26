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
 * One player's OWN current characteristics, from a `lineUps[]` entry --
 * distinct from `TpPositionCharacteristics` (the position template they were
 * recruited from) even though the shape is identical: a player's values drift
 * from the template as they level up. `passing` is a plain number, never null,
 * for the same reason `TpPositionCharacteristics.passing` is: TP writes a
 * literal 0 for a player with no passing ability, and every rules set TP
 * covers declares a Passing characteristic.
 */
export interface TpPlayerCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * One player's CURRENTLY OUTSTANDING lasting injuries, as TP reports them
 * live in a `lineUps[]` entry. Not a career tally: `totalInjuries` on the same
 * entry is that, and is a different fact — these heal, that one does not.
 *
 * TP exposes only two of the three kinds directly. `nigglingInjuries` is a
 * count; `canPlayNextGame: false` is TP's spelling of miss-next-game. It has
 * no explicit flag for "this characteristic is currently reduced" at all —
 * that has to be derived by diffing the entry's own `ma/st/ag/pa/av` against
 * {@link TpRosterPlayer.positionTemplate}, which is the importer's job, not
 * this parser's.
 */
export interface TpPlayerLastingInjuries {
  nigglingInjuries: number;
  canPlayNextGame: boolean;
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
 * all, so `lineUpMasterId` never resolves for one. `TpPlayerPositionService`
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
  /**
   * The player's own current characteristics, or `undefined` when the source
   * entry carried none. Only a standalone `rosters_<id>.json` entry has them:
   * the match-embedded roster snapshots `MatchParserService` parses through
   * the same `LineUpSchema` do not, which is why every raw field is optional.
   */
  characteristics?: TpPlayerCharacteristics;
  /**
   * The player's live lasting-injury state, or `undefined` when the source
   * entry carried neither field. Optional for the same reason `careerCounts`
   * and `characteristics` are: the match-embedded roster snapshots
   * `MatchParserService` parses through the same `LineUpSchema` have none of
   * it. All-or-nothing, like those two — a half set cannot be acted on.
   */
  lastingInjuries?: TpPlayerLastingInjuries;
  /**
   * The characteristics of the position template this player was recruited
   * from, from the entry's own nested `lineUpMaster`. A current-vs-template
   * diff against this can surface that a stat sits on the worse side of the
   * template, which TP does not otherwise report directly. It is not by
   * itself a sufficient baseline for an exact reduction count, though: TP
   * exposes no field distinguishing an advancement from an injury, so an
   * advancement and a reduction on the same characteristic in the same
   * player can cancel in this diff. An exact count needs TP injury history
   * or another baseline that also accounts for advancements.
   *
   * The per-entry copy rather than a cross-reference into
   * `rosterMaster.lineUpMasters[]` by id: it is right there on the player, so
   * the diff needs no lookup, and a mercenary hire that has no catalog entry
   * at all still carries one.
   */
  positionTemplate?: TpPositionCharacteristics;
  /**
   * The entry's starting and gained skills, or `undefined` when the entry
   * cannot support the split -- see `TpPlayerSkills` for what that absence
   * means.
   */
  skills?: TpPlayerSkills;
}

/**
 * One skill reference on a TP roster entry -- the position template's starting
 * skills and the player's own gained ones share this shape. `attributeType` is
 * TP's tag for what `attributeValue` holds; see `TpPositionSkillIdRef` in
 * official-teams-parser.service.ts for what each type means and why type 3 is
 * an opaque code a consumer must not compose as-is.
 */
export interface TpPlayerSkillRef {
  skillMasterId: number;
  attributeValue?: string;
  attributeType?: number;
}

/**
 * One skill the player gained via advancement. `isRandom` is TP's own record
 * of whether the advancement was randomly rolled rather than freely chosen --
 * a distinction BBL's data cannot make at all.
 */
export interface TpGainedSkillRef extends TpPlayerSkillRef {
  isRandom: boolean;
}

/**
 * A roster entry's full skill picture, or `undefined` on `TpRosterPlayer` when
 * the entry carried no position template. Only a standalone `rosters_<id>.json`
 * entry has one: a match-embedded roster snapshot carries a flat `skills` list
 * of bare ids with no starting/gained split, no `isRandom` and no attribute
 * values, which is not enough to record honestly, so the whole group is
 * reported as absent there -- the same all-or-nothing rule `careerCounts`,
 * `characteristics` and `lastingInjuries` already follow on this type.
 */
export interface TpPlayerSkills {
  starting: TpPlayerSkillRef[];
  gained: TpGainedSkillRef[];
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
  /** The coach's display name (`player.userNameToShow`), trimmed. */
  coachName: string;
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

const SkillAttributeField = {
  skillAttributeMaster: z
    .object({ value: z.string(), type: z.number().int() })
    .optional(),
};

/** A template skill: an id plus an optional attribute, and nothing else. */
const TemplateSkillSchema = z.object({
  skillMasterId: z.number().int(),
  ...SkillAttributeField,
});

/**
 * A player's own skill. `isRandom` is optional ONLY because match-embedded
 * snapshots reuse this schema and carry bare ids; an entry missing it makes
 * the whole skill group absent rather than being guessed at.
 */
const PlayerSkillSchema = z.object({
  skillMasterId: z.number().int(),
  isRandom: z.boolean().optional(),
  ...SkillAttributeField,
});

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
  // The player's OWN current characteristics. Optional for the same reason
  // the career counters above are: match-embedded roster snapshots reuse this
  // schema (see MatchLineUpSchema in match-parser.service.ts) and carry none
  // of these fields.
  ma: z.number().int().optional(),
  st: z.number().int().optional(),
  ag: z.number().int().optional(),
  pa: z.number().int().optional(),
  av: z.number().int().optional(),
  // The player's live lasting-injury state. Optional for the same reason the
  // characteristics above are: match-embedded roster snapshots reuse this
  // schema and carry neither field. Nonnegative because a negative count is
  // authored nonsense that would otherwise pass parsing only to be rejected
  // by the server's upsert schema.
  nigglingInjuries: z.number().int().nonnegative().optional(),
  canPlayNextGame: z.boolean().optional(),
  // The nested position template, the baseline a current-vs-template stat
  // diff compares against. Optional for the same reason, and its own
  // characteristics are optional within it: TP's catalog entries are not
  // uniformly complete, and an incomplete template is unusable as a baseline.
  lineUpMaster: z
    .object({
      ma: z.number().int().optional(),
      st: z.number().int().optional(),
      ag: z.number().int().optional(),
      pa: z.number().int().optional(),
      av: z.number().int().optional(),
      skills: z.array(TemplateSkillSchema).default([]),
    })
    .optional(),
  // The player's own gained skills. Defaults to [] because a match-embedded
  // snapshot's flat bare-id list still needs to parse; the missing isRandom
  // on each of those entries is what makes the whole skills group absent.
  skills: z.array(PlayerSkillSchema).default([]),
});

const RosterSchema = z.object({
  id: z.number(),
  teamName: z.string(),
  teamRace: z.string(),
  player: z.object({
    applicationUserId: z.string(),
    userNameToShow: z.string(),
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
      coachName: data.player.userNameToShow.trim(),
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
        characteristics: this.playerCharacteristics(entry),
        lastingInjuries: this.lastingInjuries(entry),
        positionTemplate: this.positionTemplate(entry),
        skills: this.skills(entry),
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

  /**
   * The entry's own characteristics, or `undefined` when it does not carry the
   * full set. All-or-nothing on purpose: the server's upsert contract requires
   * all five or none, and a partial line cannot be validated against a rules
   * set's declared formats.
   */
  private playerCharacteristics(
    entry: z.infer<typeof LineUpSchema>,
  ): TpPlayerCharacteristics | undefined {
    const { ma, st, ag, pa, av } = entry;
    if (
      ma === undefined ||
      st === undefined ||
      ag === undefined ||
      pa === undefined ||
      av === undefined
    ) {
      return undefined;
    }
    return this.characteristics({ ma, st, ag, pa, av });
  }

  /**
   * The entry's live lasting-injury state, or `undefined` when it does not
   * carry both fields. All-or-nothing on purpose, matching `careerCounts` and
   * `playerCharacteristics`: a half set cannot be acted on, and reporting it
   * as absent is honest where defaulting the missing half would not be.
   */
  private lastingInjuries(
    entry: z.infer<typeof LineUpSchema>,
  ): TpPlayerLastingInjuries | undefined {
    const { nigglingInjuries, canPlayNextGame } = entry;
    if (nigglingInjuries === undefined || canPlayNextGame === undefined) {
      return undefined;
    }
    return { nigglingInjuries, canPlayNextGame };
  }

  /**
   * The entry's nested position template, or `undefined` when it carries none
   * or carries an incomplete characteristics line. An incomplete template is
   * unusable as a diff baseline, so it is reported as absent rather than
   * partially believed.
   */
  private positionTemplate(
    entry: z.infer<typeof LineUpSchema>,
  ): TpPositionCharacteristics | undefined {
    const master = entry.lineUpMaster;
    if (master === undefined) {
      return undefined;
    }
    const { ma, st, ag, pa, av } = master;
    if (
      ma === undefined ||
      st === undefined ||
      ag === undefined ||
      pa === undefined ||
      av === undefined
    ) {
      return undefined;
    }
    return this.characteristics({ ma, st, ag, pa, av });
  }

  /**
   * The entry's starting and gained skills, or `undefined` when it carries no
   * position template -- see `TpPlayerSkills` for why that absence is the
   * signal used. A gained entry with no `isRandom` likewise makes the whole
   * group absent: without it there is no honest source to record.
   */
  private skills(
    entry: z.infer<typeof LineUpSchema>,
  ): TpPlayerSkills | undefined {
    const master = entry.lineUpMaster;
    if (master === undefined) {
      return undefined;
    }
    const gained: TpGainedSkillRef[] = [];
    for (const skill of entry.skills) {
      if (skill.isRandom === undefined) {
        return undefined;
      }
      gained.push({ ...this.skillRef(skill), isRandom: skill.isRandom });
    }
    return {
      starting: master.skills.map((skill) => this.skillRef(skill)),
      gained,
    };
  }

  /** One skill reference, with its attribute split out of TP's nested object. */
  private skillRef(skill: {
    skillMasterId: number;
    skillAttributeMaster?: { value: string; type: number };
  }): TpPlayerSkillRef {
    if (skill.skillAttributeMaster === undefined) {
      return { skillMasterId: skill.skillMasterId };
    }
    return {
      skillMasterId: skill.skillMasterId,
      attributeValue: skill.skillAttributeMaster.value,
      attributeType: skill.skillAttributeMaster.type,
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
