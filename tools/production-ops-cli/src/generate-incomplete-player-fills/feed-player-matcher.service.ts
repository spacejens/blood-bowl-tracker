import { Injectable } from '@nestjs/common';

import type {
  TpFeedHistoryReport,
  TpFeedHistoryReports,
} from '../read-tp-feed-history/tp-feed-history-index.service';
import type {
  FeedMatch,
  FeedMatchResult,
  FeedSummary,
  TeamPlayerRow,
  TeamRosterRow,
} from './fill-plan.types';

export interface FeedMatchInput {
  reports: TpFeedHistoryReports;
  /** The `tourplay.net` roster ids of the candidates' teams. */
  rosters: readonly TeamRosterRow[];
  /** Every non-star player of the candidates' teams, complete or not. */
  players: readonly TeamPlayerRow[];
}

interface Lookups {
  teamsByRoster: Map<string, number[]>;
  playersByKey: Map<string, number[]>;
}

/** `https://tourplay.net/en/blood-bowl/roster/24801` -> `24801`. */
const ROSTER_ID = /\/roster\/(\d+)\/?$/u;

/**
 * Matches the feed's player keys (team, shirt number, name, position) to
 * stored players. The shirt number is not stored, so a key names the
 * players of its roster's team with its name and position. A key that names
 * one player gives him its reports, oldest first. A key that names several,
 * or whose reports link several rosters, makes them ambiguous, and so does
 * a player named by more than one key. A key that names nobody is counted
 * and left.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class FeedPlayerMatcherService {
  match(input: FeedMatchInput): FeedMatchResult {
    const lookups: Lookups = {
      teamsByRoster: this.group(
        input.rosters,
        (row) => row.rosterId,
        (row) => row.teamId,
      ),
      playersByKey: this.group(
        input.players,
        (row) => this.key(row.teamId, row.playerName, row.positionName),
        (row) => row.playerId,
      ),
    };
    const summary: FeedSummary = {
      reportKeys: 0,
      matchedKeys: 0,
      ambiguousKeys: 0,
      unmatchedKeys: 0,
    };
    const found = new Map<number, TpFeedHistoryReport[][]>();
    const ambiguous = new Set<number>();
    for (const players of Object.values(input.reports)) {
      for (const reports of Object.values(players)) {
        summary.reportKeys += 1;
        const stored = this.storedFor(reports, lookups);
        if (stored === undefined || stored.length > 1) {
          summary.ambiguousKeys += 1;
          stored?.forEach((playerId) => ambiguous.add(playerId));
        } else if (stored.length === 0) {
          summary.unmatchedKeys += 1;
        } else {
          summary.matchedKeys += 1;
          found.set(stored[0], [...(found.get(stored[0]) ?? []), reports]);
        }
      }
    }
    const byPlayer = new Map<number, FeedMatch>();
    for (const playerId of ambiguous) {
      byPlayer.set(playerId, { kind: 'ambiguous' });
    }
    for (const [playerId, lists] of found) {
      byPlayer.set(
        playerId,
        ambiguous.has(playerId) || lists.length > 1
          ? { kind: 'ambiguous' }
          : { kind: 'reports', reports: lists[0] },
      );
    }
    return { byPlayer, summary };
  }

  /**
   * The stored players a key's reports name; undefined when the reports
   * link more than one roster.
   */
  private storedFor(
    reports: readonly TpFeedHistoryReport[],
    lookups: Lookups,
  ): number[] | undefined {
    if (reports.length === 0) {
      return [];
    }
    const rosterIds = new Set(
      reports.map((row) => ROSTER_ID.exec(row.rosterLink)?.[1] ?? ''),
    );
    if (rosterIds.has('')) {
      return [];
    }
    if (rosterIds.size > 1) {
      return undefined;
    }
    const [rosterId] = rosterIds;
    const { playerName, position } = reports[0];
    const teamIds = new Set(lookups.teamsByRoster.get(rosterId) ?? []);
    return [
      ...new Set(
        [...teamIds].flatMap(
          (teamId) =>
            lookups.playersByKey.get(this.key(teamId, playerName, position)) ??
            [],
        ),
      ),
    ];
  }

  private key(teamId: number, playerName: string, position: string): string {
    return JSON.stringify([teamId, playerName, position]);
  }

  private group<T, K, V>(
    rows: readonly T[],
    key: (row: T) => K,
    value: (row: T) => V,
  ): Map<K, V[]> {
    const grouped = new Map<K, V[]>();
    for (const row of rows) {
      grouped.set(key(row), [...(grouped.get(key(row)) ?? []), value(row)]);
    }
    return grouped;
  }
}
