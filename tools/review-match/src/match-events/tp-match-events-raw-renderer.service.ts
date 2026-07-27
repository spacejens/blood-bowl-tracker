import { Injectable } from '@nestjs/common';

import { HtmlService } from '../shared/html.service';
import { TpRawMatchFileLoaderService } from '../source/tp-raw-match-file-loader.service';
import { TpRawCodeLabelsService } from './tp-raw-code-labels.service';

const HEADERS = ['#', 'Code', 'Event id', 'Instant', 'Other raw fields'];
const NONE = '—';
/** Some events (inducements, line-ups) carry very large payloads. */
const MAX_FIELDS_LENGTH = 400;
/** Shown in their own columns, so left out of the "other fields" JSON. */
const OWN_COLUMN_FIELDS = ['matchEventType', 'id', 'instant'];

/**
 * Shows a TP match file's `matchEvents[]` array as it is on disk: the numeric
 * event code (with an independent human-readable hint), the event's own id and
 * instant, and every other field as raw JSON.
 *
 * Deliberately does not use `packages/parse-tp` — its decoding is what the
 * reviewer is checking.
 */
@Injectable()
export class TpMatchEventsRawRendererService {
  constructor(
    private readonly loader: TpRawMatchFileLoaderService,
    private readonly labels: TpRawCodeLabelsService,
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
    return this.html.table(
      HEADERS,
      events.map((event, index) => this.row(event, index)),
    );
  }

  /** The raw `matchEvents` array, or null when the file has no such array. */
  private eventsOf(file: unknown): unknown[] | null {
    if (typeof file !== 'object' || file === null) {
      return null;
    }
    const events = (file as { matchEvents?: unknown }).matchEvents;
    return Array.isArray(events) ? events : null;
  }

  private row(event: unknown, index: number): string[] {
    const fields =
      typeof event === 'object' && event !== null
        ? (event as Record<string, unknown>)
        : {};
    const code = fields.matchEventType;
    const idStr =
      fields.id == null ? NONE : `${fields.id as string | number | boolean}`;
    const instantStr =
      fields.instant == null
        ? NONE
        : `${fields.instant as string | number | boolean}`;
    return [
      String(index + 1),
      typeof code === 'number' ? this.labels.describe(code) : NONE,
      idStr,
      instantStr,
      this.otherFields(fields),
    ];
  }

  /** Everything not already in its own column, as (truncated) raw JSON. */
  private otherFields(fields: Record<string, unknown>): string {
    const rest = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !OWN_COLUMN_FIELDS.includes(key),
      ),
    );
    const json = JSON.stringify(rest);
    if (json === '{}') {
      return NONE;
    }
    return json.length > MAX_FIELDS_LENGTH
      ? `${json.slice(0, MAX_FIELDS_LENGTH)}…`
      : json;
  }
}
