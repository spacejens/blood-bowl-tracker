import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { MATCH_CATEGORIES } from '@blood-bowl-tracker/api-contract';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import type { MonthDay } from './month-day.service';
import { MonthDayService } from './month-day.service';

/** The single scope a date drill-down button carries, if any. */
export type DateButtonScopeToken =
  | { kind: 'league'; id: number }
  | { kind: 'era'; id: number }
  | { kind: 'competition'; id: number }
  | { kind: 'matchCategory'; value: MatchCategory };

/**
 * The id part of a date drill-down button's customId: a calendar date, plus
 * at most one scope, so clicking through from a scoped toplist lands on an
 * equally scoped `/onthisdate`.
 *
 * The encoding uses readable segment names (`02-29:league:5`) rather than
 * compact codes, deliberately: an engineer reading a raw Discord interaction
 * payload or a log line can tell what a customId means without
 * cross-referencing a codec. At most one scope segment is ever present,
 * because the `/insights` scope options are already mutually exclusive.
 *
 * Both directions live here so the format cannot drift between them. `decode`
 * returning `null` is defensive only — Discord only ever hands back an id
 * this service itself produced.
 */
@Injectable()
export class DateButtonIdService {
  constructor(private readonly monthDay: MonthDayService) {}

  encode(monthDay: MonthDay, scope: FactScope): string {
    const date = `${this.pad(monthDay.month)}-${this.pad(monthDay.day)}`;
    return `${date}${this.encodeScope(scope)}`;
  }

  decode(
    idPart: string,
  ): { monthDay: MonthDay; scopeToken: DateButtonScopeToken | null } | null {
    const segments = idPart.split(':');
    if (segments.length !== 1 && segments.length !== 3) {
      return null;
    }
    const monthDay = this.monthDay.parse(segments[0]);
    if (monthDay === null) {
      return null;
    }
    if (segments.length === 1) {
      return { monthDay, scopeToken: null };
    }
    const scopeToken = this.decodeScope(segments[1], segments[2]);
    return scopeToken === null ? null : { monthDay, scopeToken };
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  /**
   * At most one scope segment: `FactScope`'s fields are mutually exclusive by
   * construction, so the first one set is the only one there can be.
   */
  private encodeScope(scope: FactScope): string {
    if (scope.leagueId !== undefined) {
      return `:league:${scope.leagueId}`;
    }
    if (scope.eraId !== undefined) {
      return `:era:${scope.eraId}`;
    }
    if (scope.competitionId !== undefined) {
      return `:competition:${scope.competitionId}`;
    }
    if (scope.category !== undefined) {
      return `:matchCategory:${scope.category}`;
    }
    return '';
  }

  private decodeScope(
    kind: string,
    value: string,
  ): DateButtonScopeToken | null {
    if (kind === 'matchCategory') {
      const category = MATCH_CATEGORIES.find((entry) => entry === value);
      return category === undefined
        ? null
        : { kind: 'matchCategory', value: category };
    }
    // A strict digits-only check, not just Number.isInteger: Number('') is 0,
    // and Number(' 5 ')/Number('0x5')/Number('5.0') all coerce to valid
    // integers too, none of which this service's own `encode` ever produces.
    if (!/^\d+$/.test(value)) {
      return null;
    }
    const id = Number(value);
    if (kind === 'league' || kind === 'era' || kind === 'competition') {
      return { kind, id };
    }
    return null;
  }
}
