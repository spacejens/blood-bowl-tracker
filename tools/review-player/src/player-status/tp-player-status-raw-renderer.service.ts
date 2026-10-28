import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { TpRawStatusEntry } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/** Marker for a field the entry does not carry. */
const ABSENT = '—';

/**
 * What TP's raw data says about a player's status: the `state` bitmask and
 * `isActive` flag of their `lineUps[]` entry, verbatim, from the roster file
 * and from the latest match snapshot carrying them, each with the file it
 * came from.
 *
 * Deliberately uninterpreted: no bit is decoded and neither origin is
 * preferred over the other. Which bit means dead or retired, and which source
 * wins, is the importer's judgement — the thing this report exists to check —
 * so a panel that made the same call could only ever agree with it.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class TpPlayerStatusRawRendererService {
  constructor(
    private readonly index: TpRawPlayerIndexService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const aggregate = await this.index.aggregateFor(externalId);
    if (aggregate === null) {
      return this.html.note(
        `Line-up id ${externalId} appears in no downloaded TP match file.`,
      );
    }
    const rows = [
      this.row('Roster file', aggregate.rosterStatus),
      this.row('Match snapshot (latest)', aggregate.matchStatus),
    ].filter((row): row is string[] => row !== null);
    if (rows.length === 0) {
      return this.html.note(
        `No state or isActive for line-up id ${externalId} in any ` +
          'downloaded TP roster or match file.',
      );
    }
    return this.html.table(['Origin', 'File', 'state', 'isActive'], rows);
  }

  private row(origin: string, entry: TpRawStatusEntry | null): string[] | null {
    if (entry === null) {
      return null;
    }
    return [
      origin,
      entry.file,
      entry.state === null ? ABSENT : String(entry.state),
      entry.isActive === null ? ABSENT : String(entry.isActive),
    ];
  }
}
