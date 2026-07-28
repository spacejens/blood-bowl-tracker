import { Injectable } from '@nestjs/common';

import type { TableCell } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import { TpRawMatchFileLoaderService } from '../source/tp-raw-match-file-loader.service';
import { TpRawPlayerNameResolverService } from '../source/tp-raw-player-name-resolver.service';
import { TpRawCodeLabelsService } from './tp-raw-code-labels.service';
import { TpRawWeatherLabelsService } from './tp-raw-weather-labels.service';

const HEADERS = ['#', 'Code', 'Event id', 'Summary', 'Other raw fields'];
const NONE = '—';
/**
 * Some events (inducements, line-ups) carry very large payloads. The JSON is
 * collapsed behind a disclosure rather than always visible, so this budget
 * only needs to keep a single expanded row from ballooning, not fit
 * comfortably in an always-shown cell.
 */
const MAX_FIELDS_LENGTH = 1000;
/** Shown in their own columns, so left out of the "other fields" JSON. */
const OWN_COLUMN_FIELDS = ['matchEventType', 'id'];
/** The codes whose gist lives in their own `extraData`, not a player. */
const WEATHER_CODE = 10;
const INDUCEMENTS_CODE = 11;
const DEDICATED_FANS_CODE = 26;
/** The one player-referencing code whose outcome is worth naming. */
const INJURY_CODE = 8;
/** TP's classic weather table, and what an event with no table means. */
const CLASSIC_WEATHER_TABLE = 0;

/**
 * Shows a TP match file's `matchEvents[]` array as it is on disk: the numeric
 * event code (with an independent human-readable hint), the event's own id, a
 * one-line summary of who or what the event is about, and every other field as
 * raw JSON behind a collapsed disclosure.
 *
 * The summary names the resolved player (prefixed `Player: `, with the
 * injury outcome appended for a code-8 event and the turn number appended
 * whenever the raw event carries one), the decoded weather condition, the
 * induced star players and/or treasury spend on an inducements event, or the
 * per-side fan-factor change on a dedicated-fans event.
 *
 * Deliberately does not use `packages/parse-tp` — its decoding is what the
 * reviewer is checking. The summary column therefore reads TP's *raw* field
 * names directly and resolves them through this tool's own independent
 * lookups, never through the parser's typed event union.
 *
 * `instant` does not get its own column: it carries little review value, and
 * the column budget is better spent on the summary. It still appears in the
 * collapsed "Other raw fields" JSON alongside every other field not shown in
 * its own column, so a reviewer who needs timing information does not have to
 * read the source file itself to find it.
 */
@Injectable()
export class TpMatchEventsRawRendererService {
  constructor(
    private readonly loader: TpRawMatchFileLoaderService,
    private readonly labels: TpRawCodeLabelsService,
    private readonly weatherLabels: TpRawWeatherLabelsService,
    private readonly players: TpRawPlayerNameResolverService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    let file: unknown;
    try {
      file = await this.loader.loadMatchFile(externalId);
    } catch (error) {
      return this.html.note(
        `Raw TP match file for match ${externalId} could not be read: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (file === null) {
      return this.html.note(
        `Raw TP match file not found for match ${externalId} (expected ` +
          `match_${externalId}.json under the configured TP data directory).`,
      );
    }

    const events = this.eventsOf(file);
    if (events === null) {
      return this.html.note('The raw TP match file has no matchEvents array.');
    }
    // Built once per match, not per row: every row resolves ids against the
    // same map.
    const names = this.players.namesFrom(file);
    return this.html.table(
      HEADERS,
      events.map((event, index) => this.row(event, index, names)),
    );
  }

  /**
   * A one-line gist of the event for a reviewer: the player it is about, or
   * the meaning of the opaque codes it carries. Reads TP's raw field names
   * directly — never `packages/parse-tp`'s typed event union.
   */
  private summary(
    fields: Record<string, unknown>,
    names: ReadonlyMap<number, string>,
  ): TableCell {
    const lineUpId = fields.lineUpId;
    if (typeof lineUpId === 'number') {
      return this.playerSummary(fields, names, lineUpId);
    }
    const extraData = this.objectAt(fields, 'extraData');
    if (fields.matchEventType === WEATHER_CODE) {
      return this.weatherSummary(extraData);
    }
    if (fields.matchEventType === INDUCEMENTS_CODE) {
      return this.inducementsSummary(extraData);
    }
    if (fields.matchEventType === DEDICATED_FANS_CODE) {
      return this.dedicatedFansSummary(extraData);
    }
    return NONE;
  }

  /**
   * `Player: <name>`, with the injury outcome appended for a code-8 (injury)
   * event and the turn number appended whenever the raw event carries one
   * (foul, casualty-caused, and injury events all optionally do). Both are
   * top-level raw fields, not under `extraData` — unlike weather or
   * inducements, these event kinds share their schema shape with every
   * other `lineUpId`-carrying event.
   */
  private playerSummary(
    fields: Record<string, unknown>,
    names: ReadonlyMap<number, string>,
    lineUpId: number,
  ): TableCell {
    const name = this.players.nameFor(names, lineUpId);
    const details: string[] = [];
    const injuryType = fields.injuryType;
    if (
      fields.matchEventType === INJURY_CODE &&
      typeof injuryType === 'string'
    ) {
      details.push(injuryType);
    }
    const turnNumber = fields.turnNumber;
    if (typeof turnNumber === 'number') {
      details.push(`turn ${turnNumber}`);
    }
    return details.length === 0
      ? `Player: ${name}`
      : `Player: ${name} (${details.join(', ')})`;
  }

  /** The raw `matchEvents` array, or null when the file has no such array. */
  private eventsOf(file: unknown): unknown[] | null {
    if (typeof file !== 'object' || file === null) {
      return null;
    }
    const events = (file as { matchEvents?: unknown }).matchEvents;
    return Array.isArray(events) ? events : null;
  }

  private row(
    event: unknown,
    index: number,
    names: ReadonlyMap<number, string>,
  ): TableCell[] {
    const fields =
      typeof event === 'object' && event !== null
        ? (event as Record<string, unknown>)
        : {};
    const code = fields.matchEventType;
    const idStr =
      fields.id == null ? NONE : `${fields.id as string | number | boolean}`;
    return [
      String(index + 1),
      typeof code === 'number' ? this.labels.describe(code) : NONE,
      idStr,
      this.summary(fields, names),
      this.otherFields(fields),
    ];
  }

  /**
   * Weather codes repeat across tables, so the table is part of the lookup;
   * an event with no `weatherTable` is TP's classic table.
   */
  private weatherSummary(extraData: Record<string, unknown>): TableCell {
    const code = extraData.weatherType;
    if (typeof code !== 'number') {
      return NONE;
    }
    const table =
      typeof extraData.weatherTable === 'number'
        ? extraData.weatherTable
        : CLASSIC_WEATHER_TABLE;
    return this.weatherLabels.describe(table, code);
  }

  /**
   * Star player names are already inline in the raw JSON — no lookup. The
   * treasury portion of the spend (`extraData.fromTreasury`) is appended
   * when present, since it is the one value change on this event kind a
   * reviewer would otherwise have to open the raw JSON to see.
   */
  private inducementsSummary(extraData: Record<string, unknown>): TableCell {
    const parts: string[] = [];
    const starPlayers = extraData.starPlayers;
    if (Array.isArray(starPlayers)) {
      const names = starPlayers
        .map((player) =>
          typeof player === 'object' && player !== null
            ? (player as { name?: unknown }).name
            : undefined,
        )
        .filter((name): name is string => typeof name === 'string');
      if (names.length > 0) {
        parts.push(names.join(', '));
      }
    }
    const fromTreasury = extraData.fromTreasury;
    if (typeof fromTreasury === 'number') {
      parts.push(`Treasury: ${fromTreasury}`);
    }
    return parts.length === 0 ? NONE : parts.join('; ');
  }

  /**
   * A code-26 (dedicated fans) event carries no player or weather reference
   * — only the fan-factor modifier change for each side.
   */
  private dedicatedFansSummary(extraData: Record<string, unknown>): TableCell {
    const local = extraData.dedicatedFansModifierLocal;
    const visitor = extraData.dedicatedFansModifierVisitor;
    if (typeof local !== 'number' && typeof visitor !== 'number') {
      return NONE;
    }
    return (
      `Dedicated fans: local ${this.signed(local)}, ` +
      `visitor ${this.signed(visitor)}`
    );
  }

  /** A numeric change with an explicit sign, or `?` when it is absent. */
  private signed(value: unknown): string {
    if (typeof value !== 'number') {
      return '?';
    }
    return value >= 0 ? `+${value}` : `${value}`;
  }

  /** The named property as a record, or an empty one when it is not one. */
  private objectAt(
    fields: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const value = fields[key];
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * Everything not already in its own column, as (truncated) pretty JSON,
   * collapsed so a long payload does not swamp the table. An event with no
   * other fields is left unwrapped — there would be nothing to expand.
   */
  private otherFields(fields: Record<string, unknown>): TableCell {
    const rest = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !OWN_COLUMN_FIELDS.includes(key),
      ),
    );
    const json = JSON.stringify(rest, null, 2);
    if (json === '{}') {
      return NONE;
    }
    const truncated =
      json.length > MAX_FIELDS_LENGTH
        ? `${json.slice(0, MAX_FIELDS_LENGTH)}…`
        : json;
    return this.html.details('expand', { pre: truncated });
  }
}
