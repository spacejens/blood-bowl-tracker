import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { rosterCopyFileSchema } from './tp-roster-snapshot-source.schema';

/** One (era directory, roster id) group of roster copies. */
export interface TpRosterCopyLocation {
  /** The era directory: the first segment of the source path. */
  readonly era: string;
  readonly rosterId: string;
}

/** One downloaded copy of a roster, as the TP import chooses between them. */
export interface TpRosterCopy extends TpRosterCopyLocation {
  /** The file's path relative to the TP data directory. */
  readonly source: string;
  /** When its newest listed match finished (epoch ms); null when none did. */
  readonly finishedAt: number | null;
  /** The TP player (line-up) ids it lists, in numeric order. */
  readonly playerIds: readonly string[];
}

export type ReadRosterCopyResult =
  | { kind: 'copy'; copy: TpRosterCopy }
  | { kind: 'unreadable'; location: TpRosterCopyLocation; reason: string };

const ROSTER_ID = /rosters_(\d+)\.json$/u;

/**
 * Reads what tells one downloaded roster copy apart from the others of its
 * roster: its era directory, roster id, players and the instant its newest
 * match finished, the way packages/parse-tp's RosterParserService reads
 * `lastMatchFinishedAt`. A file of another shape is unreadable, located by
 * its path so its group can still be marked.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class TpRosterCopyReaderService {
  read(input: { source: string; content: unknown }): ReadRosterCopyResult {
    const location = this.locate(input.source);
    const parsed = rosterCopyFileSchema.safeParse(input.content);
    if (!parsed.success) {
      return {
        kind: 'unreadable',
        location,
        reason: this.reason(parsed.error),
      };
    }
    return {
      kind: 'copy',
      copy: {
        era: location.era,
        rosterId: String(parsed.data.id),
        source: input.source,
        finishedAt: this.finishedAt(parsed.data.lastMatches),
        playerIds: parsed.data.lineUps
          .map((entry) => String(entry.id))
          .sort((a, b) => Number(a) - Number(b)),
      },
    };
  }

  /** The group a copy belongs to, from its path alone. */
  locate(source: string): TpRosterCopyLocation {
    return {
      era: source.split('/')[0],
      rosterId: ROSTER_ID.exec(source)?.[1] ?? source,
    };
  }

  private finishedAt(
    lastMatches: { scores: { finishInstant?: string | null }[] }[] | undefined,
  ): number | null {
    const instants = (lastMatches ?? [])
      .flatMap((match) => match.scores)
      .map((score) => Date.parse(score.finishInstant ?? ''))
      .filter((instant) => !Number.isNaN(instant));
    return instants.length === 0 ? null : Math.max(...instants);
  }

  private reason(error: z.ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
  }
}
