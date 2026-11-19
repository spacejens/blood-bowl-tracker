import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import { FeedOwnerFitService } from './feed-owner-fit.service';
import type { FeedFit, FeedOwner, SkillNameRow } from './fill-plan.types';

/** A component with more reports than this is not searched: every split is tried. */
export const MAX_SPLIT_REPORTS = 8;
/** A component with more possible owners than this is not searched. */
export const MAX_SPLIT_OWNERS = 4;

export interface SplitReport {
  report: TpFeedHistoryReport;
  /** The ids of the stored players who may own it; each must be in the input's owners. */
  owners: readonly number[];
}

export interface SplitSearchInput {
  /** The component's reports, oldest first. */
  reports: readonly SplitReport[];
  /** Every possible owner of any of the reports, by player id. */
  owners: ReadonlyMap<number, FeedOwner>;
  skillNames: readonly SkillNameRow[];
}

/** One split being judged, with the verdicts already known. */
interface Judged {
  split: readonly number[];
  input: SplitSearchInput;
  memo: Map<string, FeedFit>;
}

/**
 * Finds who owns which report in a component of feed keys and their
 * possible owners. A split gives each report to one of its possible owners;
 * it is valid when every owner it gives reports to can own them, in posting
 * order (FeedOwnerFitService). An owner given none is always valid, since
 * the feed may be missing his reports. Exactly one split not ruled out, and
 * fully valid, is proven; zero, several, or one that cannot be decided
 * prove nothing. More than MAX_SPLIT_REPORTS reports or MAX_SPLIT_OWNERS
 * owners prove nothing, since every split is tried.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class FeedSplitSearchService {
  constructor(private readonly fits: FeedOwnerFitService) {}

  search(
    input: SplitSearchInput,
  ): Map<number, TpFeedHistoryReport[]> | undefined {
    for (const row of input.reports) {
      for (const ownerId of row.owners) {
        if (!input.owners.has(ownerId)) {
          throw new Error(
            `Report ${row.report.messageId} names owner ${String(ownerId)}, who is not among the owners searched`,
          );
        }
      }
    }
    if (
      input.reports.length > MAX_SPLIT_REPORTS ||
      input.owners.size > MAX_SPLIT_OWNERS
    ) {
      return undefined;
    }
    const memo = new Map<string, FeedFit>();
    let possible = 0;
    let proven: Map<number, TpFeedHistoryReport[]> | undefined;
    for (const split of this.splits(input.reports)) {
      const verdict = this.verdict({ split, input, memo });
      if (verdict === 'invalid') {
        continue;
      }
      possible += 1;
      if (possible > 1) {
        return undefined;
      }
      proven =
        verdict === 'valid' ? this.byOwner(split, input.reports) : undefined;
    }
    return proven;
  }

  /** Every split: element n is the owner id report n goes to. */
  private *splits(reports: readonly SplitReport[]): Generator<number[]> {
    if (reports.length === 0) {
      yield [];
      return;
    }
    const [first, ...rest] = reports;
    for (const tail of this.splits(rest)) {
      for (const ownerId of first.owners) {
        yield [ownerId, ...tail];
      }
    }
  }

  /** Invalid when any owner cannot own his reports; unknown when any cannot be decided. */
  private verdict(judged: Judged): FeedFit {
    const { split, input, memo } = judged;
    let unknown = false;
    for (const [playerId, owner] of input.owners) {
      const indices = split.flatMap((id, at) => (id === playerId ? [at] : []));
      if (indices.length === 0) {
        continue;
      }
      const key = `${playerId}:${indices.join(',')}`;
      const fit =
        memo.get(key) ??
        this.fits.fit({
          owner,
          reports: indices.map((at) => input.reports[at].report),
          skillNames: input.skillNames,
        });
      memo.set(key, fit);
      if (fit === 'invalid') {
        return 'invalid';
      }
      unknown = unknown || fit === 'unknown';
    }
    return unknown ? 'unknown' : 'valid';
  }

  private byOwner(
    split: readonly number[],
    reports: readonly SplitReport[],
  ): Map<number, TpFeedHistoryReport[]> {
    const owned = new Map<number, TpFeedHistoryReport[]>();
    split.forEach((ownerId, at) => {
      owned.set(ownerId, [...(owned.get(ownerId) ?? []), reports[at].report]);
    });
    return owned;
  }
}
