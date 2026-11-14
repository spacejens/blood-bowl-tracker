import type {
  TpBracketMatch,
  TpMatchEmbeddedPlayer,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  MatchEventParserService,
  type TpMatchEvent,
} from './match-event-parser.service';
import { LineUpSchema } from './roster-parser.service';

/**
 * `LineUpSchema` with `rosterId` optional: unlike the standalone
 * `rosters_<id>.json` file's `lineUps[]`, a `match_<id>.json`'s embedded
 * `inscriptionLocal.roster.lineUps[]` / `inscriptionVisitor.roster.lineUps[]`
 * entries do NOT carry their own `rosterId` field in real TP data. The
 * parent roster's own `id` (already known from `inscriptionLocal.roster.id`
 * / `inscriptionVisitor.roster.id`) is used as the fallback when mapping to
 * `TpMatchEmbeddedPlayer`, since that's the roster each embedded entry
 * belongs to.
 */
const MatchLineUpSchema = LineUpSchema.partial({ rosterId: true });

/**
 * The subset of a TP `match_<id>.json` body this tool cares about.
 *
 * `playedDate` prefers `scoreResume.startInstant` (a completed match's own
 * recorded start — the most direct "actually played" signal TP exposes), then
 * `scheduledDate`, then `createdInstant`. The last is a record-setup timestamp
 * that can predate the real play date by months, so it is a last resort rather
 * than a proxy; it is also always present, which is what makes `playedDate`
 * non-optional. The field is named for what the chain resolves to, not for
 * TP's own `scheduledDate`, which is only one candidate.
 *
 * `homeRosterPlayers`/`awayRosterPlayers` capture each side's per-match roster
 * snapshot because the standalone roster file reflects only the roster's
 * composition as of the data mirror — a player who has since left is absent
 * from it even though match events still reference them by `lineUpId`. A
 * match-embedded entry carries no `rosterId` of its own, so it defaults to the
 * parent roster's id, which is what it would be anyway.
 *
 * The bracket position (`id`, `phaseOrder`, `round`, both team ids and
 * `winner`) is the contract's `TpBracketMatch`, which is what a match's
 * category classification reads. `phaseOrder` is `group.phase.order`, the
 * phase's 1-based position within the tournament; `round` is the match's
 * top-level `round`, its 1-based position within the phase; the team ids
 * are `inscriptionLocal.roster.id` / `inscriptionVisitor.roster.id`.
 * `winner` maps `scoreResume.winner` (`Local`/`Visitor`/`Draw` to
 * `home`/`away`/`draw`) and is absent when no result is recorded yet.
 */
export interface TpMatch extends TpBracketMatch {
  playedDate: Date;
  /**
   * The match's display name, built as `<title-cased roundName> <round>` —
   * e.g. `"Round 3"` (season/league) or `"Day 2"` (dungeon bowl). Names are
   * NOT unique across matches (per docs/game-concepts/matches/index.md) and
   * must never be used as an external id.
   */
  name: string;
  /** The decoded, modeled subset of the match's raw `matchEvents[]` log. */
  matchEvents: TpMatchEvent[];
  /**
   * The home side's per-match roster snapshot, from
   * `inscriptionLocal.roster.lineUps[]` (only the fields a match snapshot
   * entry carries: `TpMatchEmbeddedPlayer` in packages/api-contract). Fills
   * the gap left by a departed player being absent from the standalone roster
   * file.
   */
  homeRosterPlayers: TpMatchEmbeddedPlayer[];
  /**
   * The away side's per-match roster snapshot, from
   * `inscriptionVisitor.roster.lineUps[]`. See `homeRosterPlayers`.
   */
  awayRosterPlayers: TpMatchEmbeddedPlayer[];
  /**
   * `group.phase.type` — TP's numeric phase-kind code (e.g. 160 for the main
   * phase, 30/110 for playoff phases in the local data). TP never names a
   * match's stage in text (`roundName` only ever holds DAY/MATCHDAY/ROUND),
   * so this plus `phaseOrder` is the only stage signal available. Decoded by
   * `TpMatchCategoryService` in packages/import-tp-live -- but note that
   * `type`'s literal value carries no fixed stage meaning by itself (it is not stable
   * across seasons); the classifier keys off `phaseOrder`/`round` position
   * instead, and only carries `phaseType` for possible future use.
   */
  phaseType: number;
}

const TpMatchSchema = z.object({
  matchId: z.number(),
  round: z.number(),
  group: z.object({
    phase: z.object({
      roundName: z.string(),
      type: z.number(),
      order: z.number(),
    }),
  }),
  scheduledDate: z.string().nullish(),
  createdInstant: z.string(),
  scoreResume: z
    .object({
      startInstant: z.string().nullish(),
      winner: z.enum(['Local', 'Visitor', 'Draw']).nullish(),
    })
    .nullish(),
  inscriptionLocal: z.object({
    roster: z.object({
      id: z.number(),
      lineUps: z.array(MatchLineUpSchema),
    }),
  }),
  inscriptionVisitor: z.object({
    roster: z.object({
      id: z.number(),
      lineUps: z.array(MatchLineUpSchema),
    }),
  }),
  matchEvents: z.array(z.unknown()).nullish(),
});

@Injectable()
export class MatchParserService {
  constructor(private readonly matchEventParser: MatchEventParserService) {}

  /**
   * Validate and extract
   * `{ id, playedDate, name, homeTeamTpId, awayTeamTpId, matchEvents }` from a
   * parsed TP match JSON body. `matchId` maps to `id`; `playedDate` is
   * `scoreResume.startInstant` when set, else `scheduledDate` when set, else
   * `createdInstant`. `name` is `group.phase.roundName` title-cased plus a
   * space and `round`.
   * `homeTeamTpId`/`awayTeamTpId` are `inscriptionLocal.roster.id` /
   * `inscriptionVisitor.roster.id`. `matchEvents` is the raw `matchEvents[]`
   * array decoded via `MatchEventParserService.parse`. `homeRosterPlayers`/
   * `awayRosterPlayers` map `inscriptionLocal.roster.lineUps[]` /
   * `inscriptionVisitor.roster.lineUps[]` field-for-field the same way
   * `RosterParserService.parse()` maps its own `lineUps[]` to `players`,
   * except a missing `rosterId` (real match-embedded entries omit it)
   * defaults to the parent roster's own `id`, and each entry's bare
   * `skills[]` list becomes its `skillMasterIds`. `phaseType`/`phaseOrder` map
   * `group.phase.type`/`group.phase.order`; `round` maps the top-level
   * `round` field. `winner` maps `scoreResume.winner`
   * (`Local`/`Visitor`/`Draw` to `home`/`away`/`draw`), or left out when
   * absent.
   * Extra fields are allowed and dropped. Throws an Error whose message names
   * the failing field on any shape mismatch, or when the resolved date string
   * cannot be parsed.
   */
  parse(content: unknown): TpMatch {
    const result = TpMatchSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP match JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    const {
      matchId,
      round,
      group,
      scheduledDate,
      createdInstant,
      scoreResume,
      inscriptionLocal,
      inscriptionVisitor,
      matchEvents: rawMatchEvents,
    } = result.data;
    const dateSource =
      scoreResume?.startInstant ?? scheduledDate ?? createdInstant;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid TP match JSON: date "${dateSource}" is not a valid date.`,
      );
    }
    const roundName = group.phase.roundName;
    const name = `${roundName.charAt(0).toUpperCase()}${roundName
      .slice(1)
      .toLowerCase()} ${round}`;
    const matchEvents = this.matchEventParser.parse(rawMatchEvents ?? []);
    const winner =
      scoreResume?.winner === 'Local'
        ? 'home'
        : scoreResume?.winner === 'Visitor'
          ? 'away'
          : scoreResume?.winner === 'Draw'
            ? 'draw'
            : undefined;
    const toRosterPlayer = (
      entry: z.infer<typeof MatchLineUpSchema>,
      fallbackRosterId: number,
    ): TpMatchEmbeddedPlayer => ({
      id: entry.id,
      name: entry.name,
      number: entry.number,
      lineUpMasterId: entry.lineUpMasterId,
      rosterId: entry.rosterId ?? fallbackRosterId,
      fallbackPositionName: entry.position,
      isBigGuy: entry.isBigGuy ?? false,
      totalStarPlayerPoints: entry.totalStarPlayerPoints,
      starPlayerPoints: entry.starPlayerPoints,
      state: entry.state,
      isActive: entry.isActive,
      skillMasterIds: entry.skills.map((skill) => skill.skillMasterId),
    });
    return {
      id: matchId,
      playedDate: date,
      name,
      homeTeamTpId: inscriptionLocal.roster.id,
      awayTeamTpId: inscriptionVisitor.roster.id,
      matchEvents,
      homeRosterPlayers: inscriptionLocal.roster.lineUps.map((entry) =>
        toRosterPlayer(entry, inscriptionLocal.roster.id),
      ),
      awayRosterPlayers: inscriptionVisitor.roster.lineUps.map((entry) =>
        toRosterPlayer(entry, inscriptionVisitor.roster.id),
      ),
      phaseType: group.phase.type,
      phaseOrder: group.phase.order,
      round,
      ...(winner === undefined ? {} : { winner }),
    };
  }
}
