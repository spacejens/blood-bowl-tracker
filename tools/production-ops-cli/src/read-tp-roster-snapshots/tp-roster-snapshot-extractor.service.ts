import { Injectable } from '@nestjs/common';
import type { z } from 'zod';

import {
  matchSnapshotFileSchema,
  rosterSnapshotFileSchema,
  type SnapshotLineUp,
  type SnapshotSkillRef,
} from './tp-roster-snapshot-source.schema';
import type { TpRosterSnapshotState } from './tp-roster-snapshots.schema';

export type TpRosterSnapshotSourceKind = 'match' | 'roster';

export interface ExtractSnapshotsInput {
  kind: TpRosterSnapshotSourceKind;
  /** The file's path relative to the TP data directory. */
  source: string;
  content: unknown;
}

/** What one file shows of one player. */
export interface TpRosterSnapshotObservation {
  /** His TP player (line-up) id, his `tourplay.net` external id. */
  playerId: string;
  source: string;
  state: TpRosterSnapshotState;
}

export interface TpRosterSnapshotUnreadable {
  source: string;
  reason: string;
}

export type ExtractSnapshotsResult =
  | { kind: 'observations'; observations: TpRosterSnapshotObservation[] }
  | { kind: 'unreadable'; reason: string };

/**
 * Reads the line-ups of one downloaded TP file: both sides of a match, or a
 * roster's players. A match lists each player's starting and gained skills
 * together; a roster lists the gained ones on the player and the starting
 * ones on his position template, so the two are listed together here to
 * read alike. A file of another shape is unreadable.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class TpRosterSnapshotExtractorService {
  extract(input: ExtractSnapshotsInput): ExtractSnapshotsResult {
    if (input.kind === 'match') {
      const parsed = matchSnapshotFileSchema.safeParse(input.content);
      if (!parsed.success) {
        return { kind: 'unreadable', reason: this.reason(parsed.error) };
      }
      const { inscriptionLocal, inscriptionVisitor } = parsed.data;
      return {
        kind: 'observations',
        observations: [
          ...inscriptionLocal.roster.lineUps,
          ...inscriptionVisitor.roster.lineUps,
        ].map((entry) => this.observation(entry, entry.skills, input.source)),
      };
    }
    const parsed = rosterSnapshotFileSchema.safeParse(input.content);
    if (!parsed.success) {
      return { kind: 'unreadable', reason: this.reason(parsed.error) };
    }
    return {
      kind: 'observations',
      observations: parsed.data.lineUps.map((entry) =>
        this.observation(
          entry,
          [...(entry.lineUpMaster?.skills ?? []), ...entry.skills],
          input.source,
        ),
      ),
    };
  }

  private observation(
    entry: SnapshotLineUp,
    skills: readonly SnapshotSkillRef[],
    source: string,
  ): TpRosterSnapshotObservation {
    return {
      playerId: String(entry.id),
      source,
      state: {
        lineUpMasterId: entry.lineUpMasterId,
        level: entry.level,
        skillMasterIds: skills
          .map((skill) => skill.skillMasterId)
          .sort((a, b) => a - b),
        totalSpp: entry.totalStarPlayerPoints,
        unspentSpp: entry.starPlayerPoints,
      },
    };
  }

  private reason(error: z.ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
  }
}
