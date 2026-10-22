import type {
  TpOfficialPosition,
  TpOfficialRace,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * The `teamRosterType` values marking a roster as one of the rules set's real
 * teams: `0` official and `1` legacy. TP's own teams page splits this one
 * payload client-side by that field, and legacy does NOT mean unofficial — it
 * is an older, superseded generation of an official roster that leagues did
 * and do play under (BB2020's Slann and Vampire are legacy, and real recorded
 * teams field their positions). Excluding it would drop those races,
 * positions and every team referencing them.
 *
 * Secret Bowl / unofficial (3) and experimental (4) rosters stay excluded:
 * those are genuinely non-canonical.
 */
const IMPORTED_ROSTER_TYPES = new Set([0, 1]);

/**
 * TP's `positionTypes` bitmask, bit value -> the curated keyword that value
 * IS the code of: 1 Lineman, 2 Runner, 4 Blitzer, 8 Thrower, 16 Catcher,
 * 32 Blocker, 64 Special. A position can carry several at once ("Night
 * Runner" is 3, Lineman + Runner). Confirmed against the BB2025 rulebook.
 * DB2021 also carries an additional bit (128) outside this table, which is
 * NOT an 8th positional role — see `DB2021_BIG_GUY_BIT` below, decoded
 * separately as its own source of the Big Guy keyword.
 */
const POSITION_TYPE_CODES = [1, 2, 4, 8, 16, 32, 64] as const;

/**
 * The curated code of the "Big Guy" positional keyword. TP does not give it a
 * `positionTypes` bit in the curated 1-64 table above — it is normally the
 * separate `isBigGuy` boolean. Some BB2025 entries carry both a
 * `positionTypes` bit and `isBigGuy` at once (e.g. "Deathroller", "Ogre
 * Blocker", "Mummy").
 */
const BIG_GUY_KEYWORD_CODE = 134;

/**
 * DB2021's own Big Guy signal, distinct from the curated `POSITION_TYPE_CODES`
 * table: of DB2021's 12 `positionTypes: 128` entries, 11 also carry
 * `isBigGuy: true` (e.g. DB2021 uses bit 128 where BB2025 uses bit 32 for the
 * same position type, "Ogre Blocker"). The one exception ("College of
 * Death / Mummy") also lacks `isBigGuy` on its BB2020 twin entry, suggesting
 * TP simply omits the boolean there rather than a real rules distinction.
 * Treated as an independent, additional source of `BIG_GUY_KEYWORD_CODE`
 * alongside `isBigGuy`, not as an 8th positional role.
 */
const DB2021_BIG_GUY_BIT = 128;

const CharacteristicsFields = {
  ma: z.number().int(),
  st: z.number().int(),
  ag: z.number().int(),
  pa: z.number().int(),
  av: z.number().int(),
};

const SkillRefSchema = z.object({
  skillMasterId: z.number().int(),
  skillAttributeMaster: z
    .object({ value: z.string(), type: z.number().int() })
    .optional(),
});

const SkillsField = {
  // Default rather than required: TP omits the array entirely for an entry
  // with no starting skills.
  skills: z.array(SkillRefSchema).default([]),
};

const SpecialRuleField = {
  // A star player's own exclusive skill, published as a plain name beside
  // the skills array. Optional: only stars carry one.
  specialRuleName: z.string().optional(),
};

/**
 * TP's `race` array: the position's species keyword codes, BB2025-only in
 * practice. Defaulted rather than optional, so the parsed shape is always an
 * array and no consumer has to distinguish "absent" from "empty" — for every
 * other rules set the field is simply absent and the answer is the same
 * either way.
 */
const KeywordCodesField = {
  race: z.array(z.number().int()).default([]),
};

/**
 * TP's other two sources of keyword codes: the `positionTypes` bitmask (see
 * `POSITION_TYPE_CODES`) and the `isBigGuy` boolean. Neither is BB2025-only —
 * DB2021 publishes `positionTypes` (the full positional set) and both
 * BB2020 and DB2021 publish `isBigGuy` — so both are decoded unconditionally
 * wherever present. Nullish rather than optional on both counts,
 * defensively: BB2020 omits `positionTypes` entirely.
 */
const PositionalKeywordFields = {
  positionTypes: z.number().int().nullish(),
  isBigGuy: z.boolean().nullish(),
};

const LineUpMasterSchema = z.object({
  id: z.number().optional(),
  position: z.string(),
  ...CharacteristicsFields,
  ...SkillsField,
  ...SpecialRuleField,
  ...KeywordCodesField,
  ...PositionalKeywordFields,
});

/**
 * A star player. Stars live in a SEPARATE top-level array with no
 * back-reference to any roster: which races may hire one is expressed by two
 * bitmasks that are AND-ed against the matching pair on each roster.
 * `availableRaces` also appears on BB2020 stars but is a literal 0 on every
 * one of them, so it carries no availability information and is ignored.
 */
const StarPlayerMasterSchema = z.object({
  id: z.number().optional(),
  position: z.string(),
  availableLeagues: z.number().int().optional(),
  availableTeamSpecialRules: z.number().int().optional(),
  ...CharacteristicsFields,
  ...SkillsField,
  ...SpecialRuleField,
  ...KeywordCodesField,
  ...PositionalKeywordFields,
});

const RosterMasterSchema = z.object({
  name: z.string(),
  teamRace: z.string(),
  teamRosterType: z.number().int(),
  teamSpecialRules: z.number().int(),
  selectableTeamSpecialRules: z.number().int(),
  // BB2025 moved star availability onto `leagues`; BB2020/DB2021 rosters
  // mostly carry no leagues field at all.
  leagues: z.number().int().optional(),
  selectableLeagues: z.number().int().optional(),
  lineUpMasters: z.array(LineUpMasterSchema),
});

const OfficialTeamsSchema = z.object({
  rosterMasters: z.array(RosterMasterSchema),
  starplayerMasters: z.array(StarPlayerMasterSchema),
});

type RosterMaster = z.infer<typeof RosterMasterSchema>;
type StarPlayerMaster = z.infer<typeof StarPlayerMasterSchema>;

@Injectable()
export class OfficialTeamsParserService {
  /**
   * Validate and flatten one recorded official-team-list response into its
   * official and legacy races (see `IMPORTED_ROSTER_TYPES`). Extra fields (costs, skills, quantity limits, icons) are
   * allowed and dropped by zod's default non-strict parsing. Throws an Error
   * whose message names the failing field on any shape mismatch, matching the
   * other parsers in this package.
   */
  parse(content: unknown): TpOfficialRace[] {
    const result = OfficialTeamsSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP official teams JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    const stars = result.data.starplayerMasters;
    return result.data.rosterMasters
      .filter((roster) => IMPORTED_ROSTER_TYPES.has(roster.teamRosterType))
      .map((roster) => ({
        name: roster.name,
        teamRaceCode: roster.teamRace,
        isOfficial: roster.teamRosterType === 0,
        positions: [
          ...roster.lineUpMasters.map((entry) => this.position(entry, false)),
          ...stars
            .filter((star) => this.isAvailableTo(star, roster))
            .map((star) => this.position(star, true)),
        ],
      }));
  }

  /**
   * Whether a race may hire a star. TP expresses this as two parallel
   * bitmasks: BB2025 carries the regional `leagues` a star is open to, while
   * BB2020 (and the handful of BB2025 chaos/undead stars whose availability is
   * still a team special rule) carries `availableTeamSpecialRules`. A race
   * qualifies when either mask overlaps the race's own — including the
   * `selectable*` variants, since a rule a race may CHOOSE still makes the
   * star hireable by that race (e.g. BB2025 Norse and Favoured of Khorne).
   *
   * A star's own `race[]` is deliberately NOT consulted: it is the star's
   * species (Treeman, Human, Ogre …), the same id space `lineUpMasters[].race`
   * uses, not a list of teams.
   */
  private isAvailableTo(star: StarPlayerMaster, roster: RosterMaster): boolean {
    const byLeague =
      (star.availableLeagues ?? 0) &
      ((roster.leagues ?? 0) | (roster.selectableLeagues ?? 0));
    const bySpecialRule =
      (star.availableTeamSpecialRules ?? 0) &
      (roster.teamSpecialRules | roster.selectableTeamSpecialRules);
    return byLeague !== 0 || bySpecialRule !== 0;
  }

  /** One official-list entry, regular or star, as a `TpOfficialPosition`. */
  private position(
    entry: z.infer<typeof LineUpMasterSchema>,
    isStarPlayer: boolean,
  ): TpOfficialPosition {
    return {
      name: entry.position,
      isStarPlayer,
      ...(entry.id === undefined ? {} : { tpPositionId: entry.id }),
      characteristics: {
        move: entry.ma,
        strength: entry.st,
        agility: entry.ag,
        passing: entry.pa,
        armour: entry.av,
      },
      skills: [
        ...entry.skills.map((skill) => ({
          skillMasterId: skill.skillMasterId,
          ...(skill.skillAttributeMaster === undefined
            ? {}
            : {
                attributeValue: skill.skillAttributeMaster.value,
                attributeType: skill.skillAttributeMaster.type,
              }),
        })),
        // Unconditional rather than gated on isStarPlayer: no roster this
        // importer reads (teamRosterType 0 or 1) carries the field on a
        // non-star entry, so a gate would guard a case the data proves
        // unreachable.
        ...(entry.specialRuleName === undefined
          ? []
          : [{ name: entry.specialRuleName }]),
      ],
      keywordCodes: this.keywordCodes(entry),
    };
  }

  /**
   * One entry's keyword codes, merging the three places TP publishes them:
   * the `race` array (species codes), the set bits of `positionTypes`
   * (positional codes, where the bit value IS the curated code) and the
   * `isBigGuy` flag (`BIG_GUY_KEYWORD_CODE`). Species codes keep TP's own
   * order and come first, then the bits ascending, then Big Guy.
   *
   * `isBigGuy` contributes Big Guy unconditionally whenever it is `true` — it
   * is not gated on `race` or `positionTypes`. BB2020 carries `isBigGuy` with
   * neither `race` nor `positionTypes` (39 entries); DB2021 carries it
   * alongside `positionTypes` but never `race` (12 entries). Big Guy is a
   * genuine positional keyword under those rules sets too, not just BB2025.
   * DB2021's `positionTypes` bit 128 (`DB2021_BIG_GUY_BIT`) is a second,
   * independent source of the same code — see that constant's comment.
   *
   * Deduplicated with the first occurrence winning, so a code TP happens to
   * publish twice — in `race` and as a bit, or via both `isBigGuy` and bit
   * 128 — is recorded once; the join table downstream treats
   * `(position, rules set, keyword)` as a natural key and a repeat would
   * otherwise be rejected as a duplicate in the same batch.
   */
  private keywordCodes(entry: z.infer<typeof LineUpMasterSchema>): number[] {
    const mask = entry.positionTypes ?? 0;
    const positionalCodes = POSITION_TYPE_CODES.filter(
      (code) => (mask & code) !== 0,
    );
    const isBigGuy =
      entry.isBigGuy === true || (mask & DB2021_BIG_GUY_BIT) !== 0;
    return [
      ...new Set([
        ...entry.race,
        ...positionalCodes,
        ...(isBigGuy ? [BIG_GUY_KEYWORD_CODE] : []),
      ]),
    ];
  }
}
