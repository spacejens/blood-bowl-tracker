import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags } from 'discord.js';

import { DiscordBotConfigService } from '../../discord-bot-config.service';
import { ErrorLogService } from '../../shared/error-log.service';

/** A player whose death is recorded in match events, but whose stored status says otherwise. */
export interface PlayerStatusConflict {
  id: number;
  name: string;
  /** The stored status: anything except `dead`, since `null` and `dead` are consistent with a kill. */
  status: PlayerStatus;
}

/**
 * Reports a player who is killed in match events but stored with a
 * contradicting status. That is a bug in the import. The deepdive still
 * shows the killed line, and this service tells maintainers about the bug.
 * The bug is always logged as an error. It is also posted to the TP feed's
 * debug channel when one is configured. A failed post is logged and dropped,
 * so `report` never rejects and callers can fire and forget.
 *
 * Each conflict, identified by player and stored status, is reported once per
 * service instance (that is, once per bot run). Later reports of it are
 * ignored, so showing the same player again does not repeat the report.
 */
@Injectable()
export class PlayerStatusConflictReporterService {
  private readonly logger = new Logger(
    PlayerStatusConflictReporterService.name,
  );

  private readonly reported = new Set<string>();

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly config: DiscordBotConfigService,
    private readonly errorLog: ErrorLogService,
  ) {}

  async report(conflict: PlayerStatusConflict): Promise<void> {
    const key = `${conflict.id}:${conflict.status}`;
    if (this.reported.has(key)) {
      return;
    }
    const content = `Bug: player ${conflict.id} (${conflict.name}) is killed in match events, but their stored status is ${conflict.status}`;
    this.errorLog.logError(
      this.logger,
      'Player status conflicts with match events',
      new Error(content),
    );
    this.reported.add(key);
    const channelId = this.config.getTpFeedDebugDiscordChannelId();
    if (!channelId) {
      return;
    }
    try {
      await this.discordClient.sendMessage(channelId, {
        content,
        allowedMentions: { parse: [] },
        flags: [MessageFlags.SuppressEmbeds],
      });
    } catch (error) {
      this.errorLog.logError(
        this.logger,
        'Failed to post player status conflict report',
        error,
      );
    }
  }
}
