/**
 * One side of a TP match notification, as rendered in the embed's team field.
 * Carries only what the notification itself states — no lookup against
 * tracked data happens here, because this feature's whole job is to show what
 * was parsed out of the message.
 */
export interface TeamInfo {
  name: string;
  race: string;
  coach: string;
}

/**
 * A successfully parsed TP notification, one union member per in-scope kind.
 * Recognised-but-ignored kinds (match scheduled, in-match events) and
 * unrecognised shapes are not represented here: the parser reports those as
 * the `ignored` and `unrecognized` members of `TpFeedParseResult` instead.
 *
 * `link` is always the embed's `author.url` — the match page for start and
 * end, the roster page for skill, hire and fire.
 */
export type TpFeedEvent =
  | { kind: 'match-start'; home: TeamInfo; away: TeamInfo; link: string }
  | {
      kind: 'match-end';
      home: TeamInfo;
      away: TeamInfo;
      homeScore: number;
      awayScore: number;
      outcome: 'draw' | 'win';
      /** Null for a draw; otherwise the winner as TP's own text names it. */
      winnerName: string | null;
      link: string;
    }
  | {
      kind: 'new-skill-or-characteristic';
      playerNumber: string;
      playerName: string;
      position: string;
      teamName: string;
      /** The field value with backticks stripped and whitespace collapsed. */
      description: string;
      link: string;
    }
  | {
      kind: 'hired';
      playerNumber: string;
      playerName: string;
      position: string;
      teamName: string;
      link: string;
    }
  | {
      kind: 'fired';
      playerNumber: string;
      playerName: string;
      position: string;
      teamName: string;
      link: string;
    };

/**
 * The outcome of feeding one Discord message to the TP parser.
 *
 * The three statuses exist because the two uninteresting outcomes are not
 * equally uninteresting:
 *
 * - `ignored` — the message is not a TP notification at all, or it is a kind
 *   this feature recognises and deliberately leaves alone (match scheduled,
 *   in-match events). Nothing is logged and nothing is posted.
 * - `unrecognized` — the message *looks* like a TP notification but matches
 *   no known kind, or matches one and then fails to parse a field. TP can
 *   change its message format without notice, so these are surfaced both in
 *   the server log and in the debug channel.
 * - `event` — a notification this feature understands.
 */
export type TpFeedParseResult =
  | { status: 'event'; event: TpFeedEvent }
  | { status: 'ignored' }
  | { status: 'unrecognized' };
