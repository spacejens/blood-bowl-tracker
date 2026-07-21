import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  MatchEventParserService,
  type TpMatchEvent,
} from './match-event-parser.service';
import { LineUpSchema, type TpRosterPlayer } from './roster-parser.service';

/**
 * `LineUpSchema` with `rosterId` optional: unlike the standalone
 * `rosters_<id>.json` file's `lineUps[]`, a `match_<id>.json`'s embedded
 * `inscriptionLocal.roster.lineUps[]` / `inscriptionVisitor.roster.lineUps[]`
 * entries do NOT carry their own `rosterId` field in real TP data. The
 * parent roster's own `id` (already known from `inscriptionLocal.roster.id`
 * / `inscriptionVisitor.roster.id`) is used as the fallback when mapping to
 * `TpRosterPlayer`, since that's the roster each embedded entry belongs to.
 */
const MatchLineUpSchema = LineUpSchema.partial({ rosterId: true });

/**
 * The subset of a TP `match_<id>.json` body this tool cares about.
 *
 * `playedDate` is the resolved play date, preferring the closest available
 * signal for when the match was actually played: `scoreResume.startInstant`
 * (a completed match's own recorded start time — the most direct "actually
 * played" signal TP exposes) when present and non-null, else TP's own
 * `scheduledDate` field (the agreed play date — typically tracks
 * `scoreResume.startInstant` closely when both exist, and the best available
 * signal for a match with no scoreResume yet — see
 * docs/import-tp/file-format.md), else `createdInstant` (always present in
 * the data, but only a record-setup timestamp — it can predate the actual
 * play date by months, so it is a last-resort fallback, not a proxy for
 * "played"). It is named `playedDate`, not `scheduledDate`, because that is
 * what the fallback logic resolves to — TP's own `scheduledDate` field is
 * only one of its three candidate sources, not always the winner. It is
 * always a Date because the required `createdInstant` fallback guarantees
 * one.
 *
 * The home/away team roster ids come from `inscriptionLocal.roster.id` /
 * `inscriptionVisitor.roster.id`. Other match fields (state, turn, the rest
 * of the nested roster bodies, etc.) are intentionally ignored until a
 * future sub-issue needs them — the same "parse only what's needed"
 * convention as TournamentParserService. `matchEvents` is the exception: it
 * is decoded via `MatchEventParserService.parse`.
 *
 * `inscriptionLocal.roster.lineUps[]` / `inscriptionVisitor.roster.lineUps[]`
 * are also parsed, into `homeRosterPlayers`/`awayRosterPlayers`: each embeds
 * a per-match snapshot of that side's full roster at match time, in
 * (almost) the same shape as the standalone `rosters_<id>.json` file's own
 * `lineUps[]` -- except a match-embedded entry does NOT carry its own
 * `rosterId` field in real TP data (unlike the standalone file), so it
 * defaults to the parent roster's own `id` (`inscriptionLocal.roster.id` /
 * `inscriptionVisitor.roster.id`), which is what it would be anyway. This
 * exists because the standalone roster file only reflects a roster's CURRENT
 * composition as of when the local TP data mirror was downloaded — a player
 * who has since left/been replaced is silently absent from it, even though
 * historical `matchEvents[]` in this and other matches can still reference
 * them by `lineUpId`. `TpPlayersImportService` unions these per-match
 * snapshots into player import (see `tools/import-tp`) so departed players
 * are still importable and resolvable.
 */
export interface TpMatch {
  id: number;
  playedDate: Date;
  /**
   * The match's display name, built as `<title-cased roundName> <round>` —
   * e.g. `"Round 3"` (season/league) or `"Day 2"` (dungeon bowl). Names are
   * NOT unique across matches (per docs/game-concepts/matches/index.md) and
   * must never be used as an external id.
   */
  name: string;
  /** The home team's TP roster id (`inscriptionLocal.roster.id`). */
  homeTeamTpId: number;
  /** The away team's TP roster id (`inscriptionVisitor.roster.id`). */
  awayTeamTpId: number;
  /** The decoded, modeled subset of the match's raw `matchEvents[]` log. */
  matchEvents: TpMatchEvent[];
  /**
   * The home side's per-match roster snapshot, from
   * `inscriptionLocal.roster.lineUps[]` (same shape as
   * `RosterParserService`'s `players`). Fills the gap left by a departed
   * player being absent from the standalone roster file.
   */
  homeRosterPlayers: TpRosterPlayer[];
  /**
   * The away side's per-match roster snapshot, from
   * `inscriptionVisitor.roster.lineUps[]`. See `homeRosterPlayers`.
   */
  awayRosterPlayers: TpRosterPlayer[];
}

const TpMatchSchema = z.object({
  matchId: z.number(),
  round: z.number(),
  group: z.object({
    phase: z.object({
      roundName: z.string(),
    }),
  }),
  scheduledDate: z.string().nullish(),
  createdInstant: z.string(),
  scoreResume: z
    .object({
      startInstant: z.string().nullish(),
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
   * defaults to the parent roster's own `id`.
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
    const toRosterPlayer = (
      entry: z.infer<typeof MatchLineUpSchema>,
      fallbackRosterId: number,
    ) => ({
      id: entry.id,
      name: entry.name,
      number: entry.number,
      lineUpMasterId: entry.lineUpMasterId,
      rosterId: entry.rosterId ?? fallbackRosterId,
      fallbackPositionName: entry.position,
      isBigGuy: entry.isBigGuy ?? false,
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
    };
  }
}
