import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TpPositionCharacteristics } from './roster-parser.service';

/**
 * One entry on a race's official list — a regular position or a star player.
 * TP's official team list publishes both with the same five characteristics,
 * so one shape covers both and `isStarPlayer` is the only difference. This
 * is what lets the importer take a single path for regular and star
 * positions alike.
 */
export interface TpOfficialPosition {
  name: string;
  isStarPlayer: boolean;
  /**
   * TP's own numeric id for this position, when the official list carries
   * one. Registered as a TP external id by the importer, which is what keeps
   * a roster-embedded player resolvable: `TpPlayersImportService` looks its
   * position up by `String(lineUpMasterId)`.
   */
  tpPositionId?: number;
  characteristics: TpPositionCharacteristics;
}

/**
 * One race on TP's official team list for one rules set. `teamRaceCode` is
 * TP's raw team-race code, which carries a rules-set variant suffix and is
 * NOT one-per-logical-race; `name` is the display name, stable across every
 * code variant of the same logical race. Which rules set a parsed race
 * belongs to is not in the payload — it is the folder the file was read
 * from, and the reader tags it.
 */
export interface TpOfficialRace {
  name: string;
  teamRaceCode: string;
  /**
   * Whether this race came from an official (`teamRosterType === 0`) roster
   * rather than a legacy (`1`) one -- see `IMPORTED_ROSTER_TYPES`. Threaded
   * through the same way `isStarPlayer` already is, so a downstream consumer
   * that needs to prefer official data over legacy (e.g.
   * `TpPositionsImportService`'s characteristics conflict resolution) does
   * not have to re-derive it from `teamRosterType` itself.
   */
  isOfficial: boolean;
  positions: TpOfficialPosition[];
}

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

const CharacteristicsFields = {
  ma: z.number().int(),
  st: z.number().int(),
  ag: z.number().int(),
  pa: z.number().int(),
  av: z.number().int(),
};

const LineUpMasterSchema = z.object({
  id: z.number().optional(),
  position: z.string(),
  ...CharacteristicsFields,
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
    };
  }
}
