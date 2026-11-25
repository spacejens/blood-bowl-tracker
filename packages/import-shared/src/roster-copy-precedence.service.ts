import { Injectable } from '@nestjs/common';

export type RosterCopyTiePolicy = 'first' | 'all';

export interface NewestRosterCopiesInput<T> {
  copies: readonly T[];
  /** When the copy's newest match finished (epoch ms); null/undefined when none did. */
  finishedAt: (copy: T) => number | null | undefined;
  /** `first` keeps the first tied copy, `all` every tied copy. */
  ties: RosterCopyTiePolicy;
}

/**
 * Which downloaded copies of one roster count: the one whose newest match
 * finished last, a copy with no finish instant counting as older than any
 * with one. The TP import sends one copy and keeps the first seen on a tie;
 * the manual-import planner, which cannot know the import's read order,
 * counts every tied copy.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class RosterCopyPrecedenceService {
  newest<T>(input: NewestRosterCopiesInput<T>): T[] {
    const finish = (copy: T): number =>
      input.finishedAt(copy) ?? Number.NEGATIVE_INFINITY;
    let best = Number.NEGATIVE_INFINITY;
    for (const copy of input.copies) {
      best = Math.max(best, finish(copy));
    }
    const tied = input.copies.filter((copy) => finish(copy) === best);
    return input.ties === 'first' ? tied.slice(0, 1) : tied;
  }
}
