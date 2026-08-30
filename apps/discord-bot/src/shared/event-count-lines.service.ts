import type {
  PlayerDeepdiveCategoryCounts,
  PlayerDeepdiveEventGroup,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * Renders the counter block that shows event counts (touchdowns, fouls,
 * casualties, etc.) as lines of text.
 *
 * The five simple categories render in their fixed order (zero ones omitted),
 * then the casualty and foul lines, each carrying its own severity breakdown.
 * A player with nothing at all in any counter gets a short placeholder rather
 * than an empty block (the wording differs between a player with no events and
 * a date on which nothing happened, so the placeholder is a parameter rather
 * than a shared constant).
 */
@Injectable()
export class EventCountLinesService {
  /**
   * The counter block: the five simple categories in their fixed order (zero
   * ones omitted), then the casualty and foul lines, each carrying its own
   * severity breakdown. When every counter is zero, returns the caller-supplied
   * placeholder in a one-element array.
   */
  build(
    counts: PlayerDeepdiveCategoryCounts,
    noEventsMessage: string,
  ): string[] {
    const lines = [
      ...counts.simple
        .filter((category) => category.count > 0)
        .map((category) => `${category.label}: ${category.count}`),
      ...this.buildGroupLine('Casualties inflicted', counts.casualties),
      ...this.buildGroupLine('Fouls committed', counts.fouls),
    ];
    return lines.length === 0 ? [noEventsMessage] : lines;
  }

  /**
   * One counter line with a severity breakdown, e.g.
   * `Fouls committed: 7 (3 serious injuries, 2 killed)`. A zero sub-count is
   * dropped from the parenthetical along with its comma, the parenthetical
   * disappears when both are zero, and a zero total drops the line entirely —
   * matching this embed's "no placeholder for zero" convention throughout.
   */
  private buildGroupLine(
    label: string,
    group: PlayerDeepdiveEventGroup,
  ): string[] {
    if (group.total === 0) {
      return [];
    }
    const parts = [
      ...(group.seriousInjuries === 0
        ? []
        : [`${group.seriousInjuries} serious injuries`]),
      ...(group.killed === 0 ? [] : [`${group.killed} killed`]),
    ];
    const breakdown = parts.length === 0 ? '' : ` (${parts.join(', ')})`;
    return [`${label}: ${group.total}${breakdown}`];
  }
}
