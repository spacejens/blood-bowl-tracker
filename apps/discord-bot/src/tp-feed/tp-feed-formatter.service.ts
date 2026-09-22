import { Injectable } from '@nestjs/common';

import type { TpFeedEvent } from './tp-feed-event';

/** A `match-end` event, narrowed out of the union for the helper below. */
type MatchEndEvent = Extract<TpFeedEvent, { kind: 'match-end' }>;

/**
 * Renders one parsed TP notification as a single line of plain text — the
 * human-readable interpretation this feature exists to let a maintainer
 * eyeball. Pure formatting: no I/O, no branching on anything but the event.
 */
@Injectable()
export class TpFeedFormatterService {
  format(event: TpFeedEvent): string {
    switch (event.kind) {
      case 'match-start':
        return `Match started: ${event.home.name} (${event.home.race}) vs ${event.away.name} (${event.away.race}) — ${event.link}`;
      case 'match-end':
        return this.formatMatchEnd(event);
      case 'new-skill-or-characteristic':
        return `New skill/characteristic: #${event.playerNumber} ${event.playerName} (${event.position}, ${event.teamName}) — ${event.description} — ${event.link}`;
      case 'hired':
        return `Hired: #${event.playerNumber} ${event.playerName} (${event.position}) for ${event.teamName} — ${event.link}`;
      case 'fired':
        return `Fired: #${event.playerNumber} ${event.playerName} (${event.position}) from ${event.teamName} — ${event.link}`;
    }
  }

  /**
   * Renders the heads-up posted for a message that looks like a TP
   * notification but did not resolve to a parsed event — either an
   * unrecognised shape or a recognised kind whose fields failed to parse.
   * Deliberately generic: the detailed reason stays in the parser's own
   * server-log warning, and this line exists only to point a maintainer at
   * the original message.
   */
  formatUnrecognized(messageUrl: string): string {
    return `Unrecognized TP notification — ${messageUrl}`;
  }

  /**
   * Which side won is decided by the scores rather than by `winnerName`:
   * TP's prose names the winner in title case ("Calavera Selvática FC") while
   * the team fields are upper-cased ("CALAVERA SELVÁTICA FC"), so the two
   * cannot usually be matched by comparison. `winnerName` is printed only
   * when it agrees (case-insensitively) with the score-selected side — a
   * conflicting `winnerName` (TP data inconsistency, or a tie broken by name
   * instead — see `homeWon`) would otherwise name one side as both winner and
   * loser. The score-selected team's own name is used whenever it doesn't
   * agree, or when TP omits `winnerName` entirely.
   */
  private formatMatchEnd(event: MatchEndEvent): string {
    if (event.outcome === 'draw') {
      return `Match ended in a draw: ${event.home.name} ${event.homeScore} - ${event.awayScore} ${event.away.name} — ${event.link}`;
    }
    const homeWon = this.homeWon(event);
    const winner = homeWon ? event.home : event.away;
    const loser = homeWon ? event.away : event.home;
    const winnerScore = homeWon ? event.homeScore : event.awayScore;
    const loserScore = homeWon ? event.awayScore : event.homeScore;
    const winnerName =
      event.winnerName?.toLowerCase() === winner.name.toLowerCase()
        ? event.winnerName
        : winner.name;
    return `Match ended: ${winnerName} won ${winnerScore}-${loserScore} vs ${loser.name} — ${event.link}`;
  }

  /**
   * `outcome: 'win'` comes purely from parsing a "Winner X in ..." sentence,
   * independent of the scores TP also reports — so a win can be reported
   * with an equal (e.g. 0-0) score, where score comparison cannot tell which
   * side actually won. There, the named winner decides instead: compared
   * case-insensitively, since `winnerName` is title-cased prose ("Calavera
   * Selvática FC") while the team fields are upper-cased ("CALAVERA
   * SELVÁTICA FC"). Falls back to the score comparison when `winnerName` is
   * null or matches neither team's name.
   */
  private homeWon(event: MatchEndEvent): boolean {
    if (event.homeScore !== event.awayScore) {
      return event.homeScore > event.awayScore;
    }
    const winnerName = event.winnerName?.toLowerCase();
    if (winnerName === event.home.name.toLowerCase()) return true;
    if (winnerName === event.away.name.toLowerCase()) return false;
    return event.homeScore >= event.awayScore;
  }
}
