import {
  TP_FEED_ADVANCEMENT_AUTHOR,
  TpFeedAdvancement,
  TpFeedAdvancementParserService,
} from '@blood-bowl-tracker/parse-tp-feed';
import { Injectable } from '@nestjs/common';

import { SnowflakeOrderService } from './snowflake-order.service';
import type { TpFeedMessage } from './tp-feed-message.schema';

/** The bot's processed reaction is ✔️; matched on its base character. */
const PROCESSED_REACTION_PREFIX = '✔';

/** One advancement report in `reports.json`. */
export interface TpFeedHistoryReport {
  readonly messageId: string;
  readonly link: string;
  readonly timestamp: string;
  readonly teamName: string;
  readonly playerNumber: string;
  readonly playerName: string;
  readonly position: string;
  /**
   * Whether the bot had reacted with its check mark. A hint only: a missing
   * reaction can also mean downtime, a failed import or scraping off.
   */
  readonly botReacted: boolean;
  readonly rosterLink: string;
  readonly selection: TpFeedAdvancement['selection'];
  readonly category: TpFeedAdvancement['category'];
  readonly gain: TpFeedAdvancement['gain'];
  readonly sppCost: TpFeedAdvancement['sppCost'];
  readonly valueText: string;
  readonly rawValue: string;
}

/** Team name → `#number name (position)` → reports, oldest first. */
export type TpFeedHistoryReports = Record<
  string,
  Record<string, TpFeedHistoryReport[]>
>;

/** One advancement-author message in `unparsed.json`. */
export interface TpFeedHistoryUnparsed {
  readonly reason: string;
  readonly messageId: string;
  readonly link: string;
}

export interface TpFeedHistoryIndex {
  readonly reports: TpFeedHistoryReports;
  readonly unparsed: TpFeedHistoryUnparsed[];
}

export interface TpFeedHistoryIndexInput {
  readonly messages: readonly TpFeedMessage[];
  readonly guildId: string;
  readonly channelId: string;
}

/**
 * Re-parses every saved advancement message into the searchable index files.
 * Never trusts the bot's reaction: every message is parsed here, and the
 * reaction is recorded only as a hint.
 */
@Injectable()
export class TpFeedHistoryIndexService {
  constructor(
    private readonly advancementParser: TpFeedAdvancementParserService,
    private readonly snowflakes: SnowflakeOrderService,
  ) {}

  /** Webhook-authored, with a first embed from TP's advancement author. */
  isAdvancement(message: TpFeedMessage): boolean {
    return (
      message.webhook_id !== undefined &&
      message.embeds.at(0)?.author?.name === TP_FEED_ADVANCEMENT_AUTHOR
    );
  }

  build(input: TpFeedHistoryIndexInput): TpFeedHistoryIndex {
    // Maps, not object literals, so a team or player named like an
    // Object.prototype key cannot collide with one.
    const teams = new Map<string, Map<string, TpFeedHistoryReport[]>>();
    const unparsed: TpFeedHistoryUnparsed[] = [];
    const ordered = [...input.messages].sort((a, b) =>
      this.snowflakes.compare(a.id, b.id),
    );
    for (const message of ordered) {
      if (!this.isAdvancement(message)) continue;
      const link = `https://discord.com/channels/${input.guildId}/${input.channelId}/${message.id}`;
      const result = this.advancementParser.parse(message.embeds[0]);
      if (!result.ok) {
        const reason = `${result.failedField} did not match the expected shape`;
        unparsed.push({ reason, messageId: message.id, link });
        continue;
      }
      const found = result.advancement;
      if (found.gain === null) {
        const reason = `advancement not understood: ${found.valueText}`;
        unparsed.push({ reason, messageId: message.id, link });
        continue;
      }
      const players =
        teams.get(found.teamName) ?? new Map<string, TpFeedHistoryReport[]>();
      teams.set(found.teamName, players);
      const playerKey = `#${found.playerNumber} ${found.playerName} (${found.position})`;
      const reports = players.get(playerKey) ?? [];
      players.set(playerKey, reports);
      reports.push(this.toReport(message, found, link));
    }
    return {
      reports: Object.fromEntries(
        [...teams].map(([team, players]) => [
          team,
          Object.fromEntries(players),
        ]),
      ),
      unparsed,
    };
  }

  private toReport(
    message: TpFeedMessage,
    found: TpFeedAdvancement,
    link: string,
  ): TpFeedHistoryReport {
    return {
      messageId: message.id,
      link,
      timestamp: message.timestamp,
      teamName: found.teamName,
      playerNumber: found.playerNumber,
      playerName: found.playerName,
      position: found.position,
      botReacted: this.botReacted(message),
      rosterLink: found.rosterLink,
      selection: found.selection,
      category: found.category,
      gain: found.gain,
      sppCost: found.sppCost,
      valueText: found.valueText,
      rawValue: found.rawValue,
    };
  }

  private botReacted(message: TpFeedMessage): boolean {
    return (message.reactions ?? []).some(
      (reaction) =>
        reaction.me &&
        (reaction.emoji.name ?? '').startsWith(PROCESSED_REACTION_PREFIX),
    );
  }
}
