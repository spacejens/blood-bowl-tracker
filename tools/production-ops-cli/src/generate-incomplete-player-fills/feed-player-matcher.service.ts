import { Injectable } from '@nestjs/common';

import type {
  TpFeedHistoryReport,
  TpFeedHistoryReports,
} from '../read-tp-feed-history/tp-feed-history-index.service';
import { FeedSplitSearchService } from './feed-split-search.service';
import type {
  FeedMatch,
  FeedMatchResult,
  FeedOwner,
  FeedPricingRows,
  FeedSummary,
  TeamPlayerRow,
  TeamRosterRow,
} from './fill-plan.types';
import { PricingRulesSetsService } from './pricing-rules-sets.service';

export interface FeedMatchInput {
  reports: TpFeedHistoryReports;
  /** The `tourplay.net` roster ids of the candidates' teams. */
  rosters: readonly TeamRosterRow[];
  /** Every non-star TP player of the candidates' teams, complete or not. */
  players: readonly TeamPlayerRow[];
  /** What a possible owner's reports are priced with. */
  pricing: FeedPricingRows;
}

/** One report, with the stored players who may own it. */
interface OwnedReport {
  report: TpFeedHistoryReport;
  owners: TeamPlayerRow[];
}

/** One feed key's reports, at least one of which someone stored may own. */
interface KeyClaim {
  reports: OwnedReport[];
  /** Some reports have no possible owner, or a message id is not a number. */
  unprovable: boolean;
}

interface Lookups {
  teamsByRoster: Map<string, number[]>;
  playersByKey: Map<string, TeamPlayerRow[]>;
}

/** `https://tourplay.net/en/blood-bowl/roster/24801` -> `24801`. */
const ROSTER_ID = /\/roster\/(\d+)\/?$/u;
const MESSAGE_ID = /^\d+$/u;

/**
 * Matches the feed's player keys (team, shirt number, name, position) to
 * stored TP players. The shirt number is not stored, so a report may belong
 * to any TP player of its roster's teams with its name and position whose
 * stored total is at least the cost it shows (an unknown total or cost rules
 * nobody out). A key none of whose reports anyone may own is unmatched.
 *
 * Keys sharing a possible owner are decided together, as one component. A
 * component is ambiguous when a key has reports nobody may own beside
 * reports someone may (an owner not stored cannot be ruled out), a message
 * id is not a number, or a marked journeyman may own a report. One key with
 * one possible owner gives him its reports, oldest first, and the
 * advancement stage checks them. Any other component goes to
 * FeedSplitSearchService, and its one proven split gives each owner his
 * reports; an owner given none is left out. So one owner named by several
 * feed keys is decided through the split search, and an undecidable or
 * invalid split leaves him `feed-match-ambiguous`, while one owner named by
 * one key goes straight to the advancement stage, which gives the specific
 * skip reason.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class FeedPlayerMatcherService {
  constructor(
    private readonly splits: FeedSplitSearchService,
    private readonly pricingRulesSets: PricingRulesSetsService,
  ) {}

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
        (row) => row,
      ),
    };
    const summary: FeedSummary = {
      reportKeys: 0,
      matchedKeys: 0,
      ambiguousKeys: 0,
      unmatchedKeys: 0,
    };
    const claims: KeyClaim[] = [];
    for (const players of Object.values(input.reports)) {
      for (const reports of Object.values(players)) {
        summary.reportKeys += 1;
        const claim = this.claim(reports, lookups);
        if (claim === undefined) {
          summary.unmatchedKeys += 1;
        } else {
          claims.push(claim);
        }
      }
    }
    const byPlayer = new Map<number, FeedMatch>();
    for (const component of this.components(claims)) {
      const owned = this.decide(component, input.pricing);
      if (owned === undefined) {
        summary.ambiguousKeys += component.length;
        for (const row of this.ownerRows(component)) {
          byPlayer.set(row.playerId, { kind: 'ambiguous' });
        }
      } else {
        summary.matchedKeys += component.length;
        for (const [playerId, reports] of owned) {
          byPlayer.set(playerId, { kind: 'reports', reports });
        }
      }
    }
    return { byPlayer, summary };
  }

  /** Who may own each of a key's reports; undefined when nobody may own any. */
  private claim(
    reports: readonly TpFeedHistoryReport[],
    lookups: Lookups,
  ): KeyClaim | undefined {
    const owned = reports.map((report) => ({
      report,
      owners: this.ownersOf(report, lookups),
    }));
    const claimed = owned.filter((row) => row.owners.length > 0).length;
    if (claimed === 0) {
      return undefined;
    }
    return {
      reports: owned,
      unprovable:
        claimed < owned.length ||
        !reports.every((row) => MESSAGE_ID.test(row.messageId)),
    };
  }

  /** The TP players of the report's roster's teams, with its name and position, who can afford it. */
  private ownersOf(
    report: TpFeedHistoryReport,
    lookups: Lookups,
  ): TeamPlayerRow[] {
    const rosterId = ROSTER_ID.exec(report.rosterLink)?.[1];
    if (rosterId === undefined) {
      return [];
    }
    const owners = new Map<number, TeamPlayerRow>();
    for (const teamId of lookups.teamsByRoster.get(rosterId) ?? []) {
      const key = this.key(teamId, report.playerName, report.position);
      for (const row of lookups.playersByKey.get(key) ?? []) {
        if (
          row.sppTotal === null ||
          report.sppCost === null ||
          row.sppTotal >= report.sppCost
        ) {
          owners.set(row.playerId, row);
        }
      }
    }
    return [...owners.values()];
  }

  /** The claims grouped so that claims sharing a possible owner are together. */
  private components(claims: readonly KeyClaim[]): KeyClaim[][] {
    const groups: KeyClaim[][] = [];
    const groupOf = new Map<number, number>();
    for (const claim of claims) {
      const joined = new Set(
        this.ownerRows([claim]).flatMap((row) => {
          const at = groupOf.get(row.playerId);
          return at === undefined ? [] : [at];
        }),
      );
      const merged = [...[...joined].flatMap((at) => groups[at]), claim];
      for (const at of joined) {
        groups[at] = [];
      }
      groups.push(merged);
      for (const row of this.ownerRows(merged)) {
        groupOf.set(row.playerId, groups.length - 1);
      }
    }
    return groups.filter((group) => group.length > 0);
  }

  /** Each owner's reports, oldest first, when the component proves them. */
  private decide(
    component: readonly KeyClaim[],
    pricing: FeedPricingRows,
  ): Map<number, TpFeedHistoryReport[]> | undefined {
    const owners = this.ownerRows(component);
    if (
      component.some((claim) => claim.unprovable) ||
      owners.some((row) => row.isJourneyman)
    ) {
      return undefined;
    }
    const reports = component
      .flatMap((claim) => claim.reports)
      .sort((a, b) => this.byPosting(a.report, b.report));
    if (component.length === 1 && owners.length === 1) {
      return new Map([[owners[0].playerId, reports.map((row) => row.report)]]);
    }
    return this.splits.search({
      reports: reports.map((row) => ({
        report: row.report,
        owners: row.owners.map((owner) => owner.playerId),
      })),
      owners: new Map(
        owners.map((row) => [row.playerId, this.owner(row, pricing)]),
      ),
      skillNames: pricing.skillNames,
    });
  }

  private owner(row: TeamPlayerRow, pricing: FeedPricingRows): FeedOwner {
    return {
      playerId: row.playerId,
      sppTotal: row.sppTotal,
      unspentSpp: row.unspentSpp,
      rulesSets: this.pricingRulesSets.build({
        rulesSetIds: pricing.eraRulesSets
          .filter((era) => era.eraId === row.eraId)
          .map((era) => era.rulesSetId),
        costs: pricing.advancementCosts.filter(
          (cost) => cost.eraId === row.eraId,
        ),
        skillCategories: pricing.skillCategories,
        positionAccess: pricing.positionAccess.filter(
          (access) => access.positionId === row.positionId,
        ),
      }),
      paid: pricing.paidAdvancements.filter(
        (paid) => paid.playerId === row.playerId,
      ),
    };
  }

  /** Every possible owner of any report of the claims, once each, in first-seen order. */
  private ownerRows(claims: readonly KeyClaim[]): TeamPlayerRow[] {
    const rows = new Map<number, TeamPlayerRow>();
    for (const claim of claims) {
      for (const owned of claim.reports) {
        for (const row of owned.owners) {
          rows.set(row.playerId, row);
        }
      }
    }
    return [...rows.values()];
  }

  /** Posting order: message ids are snowflakes, numbers too large for a double. */
  private byPosting(a: TpFeedHistoryReport, b: TpFeedHistoryReport): number {
    const [first, second] = [BigInt(a.messageId), BigInt(b.messageId)];
    if (first < second) {
      return -1;
    }
    return first > second ? 1 : 0;
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
