import { Injectable, Logger } from '@nestjs/common';
import type { Embed, Message } from 'discord.js';

import type { TeamInfo, TpFeedEvent } from './tp-feed-event';

/** `` `#10` Helmut Cool *(Imperial Thrower)* `` */
const PLAYER_FIELD_PATTERN =
  /^`#(?<number>[^`]+)`\s+(?<name>.+?)\s+\*\((?<position>[^)]+)\)\*$/u;

/** "Winner Calavera Selvática FC in 3 hours and 30 minutes." */
const WINNER_DESCRIPTION_PATTERN = /^Winner\s+(?<winner>.+?)\s+in\s+.+$/u;

/** "Draw in 2 hours and 46 minutes." */
const DRAW_DESCRIPTION_PATTERN = /^Draw\s+in\s+.+$/u;

/** The parsed pieces every player-scoped notification shares. */
interface PlayerFieldParts {
  playerNumber: string;
  playerName: string;
  position: string;
}

/**
 * Turns one TP (tourplay.net) webhook notification into a typed event.
 *
 * Deliberately total and non-throwing: every unparseable input returns null.
 * Two kinds of null are distinguished on purpose.
 *
 * - Silent null: the message is not a TP notification at all (an ordinary
 *   human post in the channel), or it is a TP notification of a kind this
 *   feature recognises and deliberately ignores (match scheduled, in-match
 *   events). Warning about those would drown the log.
 * - Warned null: the message *looks* like a TP notification but matches no
 *   known kind, or matches one and then fails to parse. TP can change its
 *   message format without notice, and these warnings are the only way to
 *   notice that drift before it silently breaks parsing.
 */
@Injectable()
export class TpFeedParserService {
  private readonly logger = new Logger(TpFeedParserService.name);

  parse(message: Message): TpFeedEvent | null {
    const embed = message.embeds.at(0);
    if (!message.webhookId || !embed) {
      return null;
    }
    const title = embed.title ?? '';
    const authorName = embed.author?.name ?? '';
    if (title.startsWith(':football:') && title.includes('Start of match')) {
      return this.parseMatchStart(embed, message.id);
    }
    if (
      title.startsWith(':checkered_flag:') &&
      title.includes('End of the match')
    ) {
      return this.parseMatchEnd(embed, message.id);
    }
    // Recognised, deliberately out of scope. "Match Event" is the shared
    // author name of every in-match event (MVP, casualty, touchdown, ...),
    // which are distinguished only by icon and value text — none of which
    // this feature needs, since the whole category is out of scope.
    if (title.includes('Match scheduled') || authorName === 'Match Event') {
      return null;
    }
    if (authorName === 'New skill/characteristic') {
      return this.parseNewSkillOrCharacteristic(embed, message.id);
    }
    if (authorName === 'Hired') {
      return this.parsePlayerTransaction(embed, message.id, 'hired');
    }
    if (authorName === 'Fired') {
      return this.parsePlayerTransaction(embed, message.id, 'fired');
    }
    this.logger.warn(
      `Unrecognized TP notification shape (message ${message.id}): ${this.describe(embed)}`,
    );
    return null;
  }

  private parseMatchStart(embed: Embed, messageId: string): TpFeedEvent | null {
    const kind = 'match-start';
    const home = this.parseTeamField(embed.fields.at(0)?.name);
    if (!home) return this.parseFailure(kind, 'home team field', messageId);
    const away = this.parseTeamField(embed.fields.at(1)?.name);
    if (!away) return this.parseFailure(kind, 'away team field', messageId);
    const link = embed.author?.url;
    if (!link) return this.parseFailure(kind, 'author.url', messageId);
    return { kind, home, away, link };
  }

  private parseMatchEnd(embed: Embed, messageId: string): TpFeedEvent | null {
    const kind = 'match-end';
    const home = this.parseTeamField(embed.fields.at(0)?.name);
    if (!home) return this.parseFailure(kind, 'home team field', messageId);
    const away = this.parseTeamField(embed.fields.at(1)?.name);
    if (!away) return this.parseFailure(kind, 'away team field', messageId);
    const homeScore = this.parseScore(embed.fields.at(0)?.value);
    if (homeScore === null)
      return this.parseFailure(kind, 'home score', messageId);
    const awayScore = this.parseScore(embed.fields.at(1)?.value);
    if (awayScore === null)
      return this.parseFailure(kind, 'away score', messageId);
    const link = embed.author?.url;
    if (!link) return this.parseFailure(kind, 'author.url', messageId);
    const description = embed.description ?? '';
    const shared = { kind, home, away, homeScore, awayScore, link } as const;
    if (DRAW_DESCRIPTION_PATTERN.test(description)) {
      return { ...shared, outcome: 'draw', winnerName: null };
    }
    const winnerName =
      WINNER_DESCRIPTION_PATTERN.exec(description)?.groups?.winner;
    if (!winnerName) return this.parseFailure(kind, 'description', messageId);
    return { ...shared, outcome: 'win', winnerName };
  }

  private parseNewSkillOrCharacteristic(
    embed: Embed,
    messageId: string,
  ): TpFeedEvent | null {
    const kind = 'new-skill-or-characteristic';
    const field = embed.fields.at(0);
    const player = this.parsePlayerField(field?.name);
    if (!player) return this.parseFailure(kind, 'player field', messageId);
    const teamName = embed.footer?.text;
    if (!teamName) return this.parseFailure(kind, 'footer.text', messageId);
    const link = embed.author?.url;
    if (!link) return this.parseFailure(kind, 'author.url', messageId);
    const description = this.parseSkillDescription(field?.value);
    if (!description) return this.parseFailure(kind, 'field value', messageId);
    return { kind, ...player, teamName, description, link };
  }

  private parsePlayerTransaction(
    embed: Embed,
    messageId: string,
    kind: 'hired' | 'fired',
  ): TpFeedEvent | null {
    const player = this.parsePlayerField(embed.fields.at(0)?.name);
    if (!player) return this.parseFailure(kind, 'player field', messageId);
    const teamName = embed.footer?.text;
    if (!teamName) return this.parseFailure(kind, 'footer.text', messageId);
    const link = embed.author?.url;
    if (!link) return this.parseFailure(kind, 'author.url', messageId);
    return { kind, ...player, teamName, link };
  }

  /**
   * `"**EVERVAIN EGRETS**\n`1290` High Elf\n:flag_se: Patrick M"` — three
   * lines: the bolded team name, the backticked roster value followed by the
   * race, and a flag shortcode followed by the coach.
   */
  private parseTeamField(name: string | undefined): TeamInfo | null {
    const lines = name?.split('\n');
    if (!lines || lines.length < 3) return null;
    const teamName = lines[0].replaceAll('**', '').trim();
    const race = lines[1].replace(/`[^`]*`/u, '').trim();
    const coach = lines[2].replace(/^:[^:\s]+:/u, '').trim();
    if (!teamName || !race || !coach) return null;
    return { name: teamName, race, coach };
  }

  private parsePlayerField(name: string | undefined): PlayerFieldParts | null {
    const groups = name ? PLAYER_FIELD_PATTERN.exec(name)?.groups : undefined;
    if (!groups) return null;
    return {
      playerNumber: groups.number,
      playerName: groups.name,
      position: groups.position,
    };
  }

  /** `` "`      0      `" `` → 0; anything non-numeric → null. */
  private parseScore(value: string | undefined): number | null {
    const digits = value?.replaceAll('`', '').trim();
    if (!digits || !/^\d+$/u.test(digits)) return null;
    return Number(digits);
  }

  /**
   * `` "Random Primary ` Guard ` ` ★8 `" `` → "Random Primary Guard ★8".
   * Backticks become spaces (rather than being deleted) so the words they
   * separate do not run together, and the result's whitespace is collapsed.
   */
  private parseSkillDescription(value: string | undefined): string {
    return (value ?? '').replaceAll('`', ' ').replace(/\s+/gu, ' ').trim();
  }

  private parseFailure(
    kind: TpFeedEvent['kind'],
    field: string,
    messageId: string,
  ): null {
    this.logger.warn(
      `Failed to parse TP ${kind} notification (message ${messageId}): ${field} did not match the expected shape`,
    );
    return null;
  }

  /** A short excerpt of an embed, enough to diagnose an unexpected shape. */
  private describe(embed: Embed): string {
    return [
      `title=${embed.title ?? '(none)'}`,
      `author.name=${embed.author?.name ?? '(none)'}`,
      `description=${embed.description ?? '(none)'}`,
    ].join(' ');
  }
}
