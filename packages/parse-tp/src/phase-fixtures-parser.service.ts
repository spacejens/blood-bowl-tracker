import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * One match as a TP phase fixture list shows it: only what classifying a
 * match's bracket stage and dating its competition need. `playedDate` is
 * `scoreResume.startInstant` when set, else `scheduledDate`; a fixture list
 * carries no `createdInstant`, so an unscheduled, unplayed fixture has none.
 */
export interface TpFixture {
  id: number;
  round: number;
  homeTeamTpId: number;
  awayTeamTpId: number;
  playedDate: Date | undefined;
  winner: 'home' | 'away' | 'draw' | undefined;
}

/** One response of TP's `tournament/<slug>/phases?...` endpoint. */
export interface TpPhaseFixtures {
  /** The round this response lists when no round was requested. */
  currentRound: number | undefined;
  /** Every round the phase has; each other round is fetched by its number. */
  roundNumbers: number[];
  fixtures: TpFixture[];
}

const RosterRefSchema = z.object({ id: z.number() }).nullish();

const TpPhaseFixturesSchema = z.object({
  currentRound: z.number().nullish(),
  rounds: z.array(z.object({ roundNumber: z.number() })).nullish(),
  matches: z
    .array(
      z.object({
        matchId: z.number(),
        round: z.number(),
        scheduledDate: z.string().nullish(),
        scoreResume: z
          .object({
            startInstant: z.string().nullish(),
            winner: z.enum(['Local', 'Visitor', 'Draw']).nullish(),
          })
          .nullish(),
        rosterLocal: RosterRefSchema,
        rosterVisitor: RosterRefSchema,
      }),
    )
    .nullish(),
});

@Injectable()
export class PhaseFixturesParserService {
  /**
   * Validate and extract a phase fixture list. A fixture missing either
   * roster (a bye) is not a match and is dropped. `winner` maps
   * `scoreResume.winner` (`Local`/`Visitor`/`Draw` to `home`/`away`/`draw`),
   * or `undefined` when absent. Extra fields are allowed and dropped. Throws
   * an Error whose message names the failing field on any shape mismatch, or
   * when a date string cannot be parsed.
   */
  parse(content: unknown): TpPhaseFixtures {
    const result = TpPhaseFixturesSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP phase fixtures JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    const { currentRound, rounds, matches } = result.data;
    const fixtures: TpFixture[] = [];
    for (const entry of matches ?? []) {
      if (!entry.rosterLocal || !entry.rosterVisitor) {
        continue;
      }
      fixtures.push({
        id: entry.matchId,
        round: entry.round,
        homeTeamTpId: entry.rosterLocal.id,
        awayTeamTpId: entry.rosterVisitor.id,
        playedDate: this.dateOf(
          entry.scoreResume?.startInstant ?? entry.scheduledDate ?? undefined,
        ),
        winner: this.winnerOf(entry.scoreResume?.winner ?? undefined),
      });
    }
    return {
      currentRound: currentRound ?? undefined,
      roundNumbers: (rounds ?? []).map((round) => round.roundNumber),
      fixtures,
    };
  }

  private dateOf(source: string | undefined): Date | undefined {
    if (source === undefined) {
      return undefined;
    }
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid TP phase fixtures JSON: date "${source}" is not a valid date.`,
      );
    }
    return date;
  }

  private winnerOf(
    winner: 'Local' | 'Visitor' | 'Draw' | undefined,
  ): TpFixture['winner'] {
    if (winner === 'Local') {
      return 'home';
    }
    if (winner === 'Visitor') {
      return 'away';
    }
    return winner === 'Draw' ? 'draw' : undefined;
  }
}
