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
   * Which side won is decided by the scores rather than by `winnerName`:
   * TP's prose names the winner in title case ("Calavera Selvática FC") while
   * the team fields are upper-cased ("CALAVERA SELVÁTICA FC"), so the two
   * cannot be matched by comparison. `winnerName` is still what gets printed,
   * falling back to the higher-scoring team's own name if TP ever omits it.
   */
  private formatMatchEnd(event: MatchEndEvent): string {
    if (event.outcome === 'draw') {
      return `Match ended in a draw: ${event.home.name} ${event.homeScore} - ${event.awayScore} ${event.away.name} — ${event.link}`;
    }
    const homeWon = event.homeScore >= event.awayScore;
    const winner = homeWon ? event.home : event.away;
    const loser = homeWon ? event.away : event.home;
    const winnerScore = homeWon ? event.homeScore : event.awayScore;
    const loserScore = homeWon ? event.awayScore : event.homeScore;
    const winnerName = event.winnerName ?? winner.name;
    return `Match ended: ${winnerName} won ${winnerScore}-${loserScore} vs ${loser.name} — ${event.link}`;
  }
}
