import { Injectable } from '@nestjs/common';
import { z } from 'zod';

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
 * `inscriptionVisitor.roster.id`. Other match fields (state, turn,
 * matchEvents, the rest of the nested roster bodies, etc.) are intentionally
 * ignored until a future sub-issue needs them — the same "parse only what's
 * needed" convention as TournamentParserService.
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
    }),
  }),
  inscriptionVisitor: z.object({
    roster: z.object({
      id: z.number(),
    }),
  }),
});

@Injectable()
export class MatchParserService {
  /**
   * Validate and extract `{ id, playedDate, name, homeTeamTpId, awayTeamTpId }`
   * from a parsed TP match JSON body. `matchId` maps to `id`; `playedDate` is
   * `scoreResume.startInstant` when set, else `scheduledDate` when set, else
   * `createdInstant`. `name` is `group.phase.roundName` title-cased plus a
   * space and `round`.
   * `homeTeamTpId`/`awayTeamTpId` are `inscriptionLocal.roster.id` /
   * `inscriptionVisitor.roster.id`.
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
    return {
      id: matchId,
      playedDate: date,
      name,
      homeTeamTpId: inscriptionLocal.roster.id,
      awayTeamTpId: inscriptionVisitor.roster.id,
    };
  }
}
