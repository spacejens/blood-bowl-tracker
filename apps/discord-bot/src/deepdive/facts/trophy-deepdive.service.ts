import type {
  TrophyHeader,
  TrophyRecipient,
} from '@blood-bowl-tracker/game-data';
import {
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

/**
 * Most recipients listed in one trophy embed. The list query fetches exactly
 * this many rows; the true total comes from a separate `countRecipients` call,
 * so the overflow note reports an exact remainder instead of the "at least one
 * more" a `limit + 1` sentinel row could prove.
 */
const MAX_TROPHY_RECIPIENTS = 30;

/**
 * Composes one trophy's header (which competition group awards it, and its
 * criteria) and every recipient it has ever had, most recent competition
 * first. Shared by `/deepdive trophy:<id>` and the trophy deepdive buttons.
 * Each DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" (`undefined`). Each
 * recipient becomes a drill-down entry — the team for a team trophy, the
 * player for a player trophy — and the competition is deliberately not linked.
 */
@Injectable()
export class TrophyDeepdiveService {
  constructor(
    private readonly trophies: TrophiesService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  async resolve(trophyId: number): Promise<string | InteractionReplyOptions> {
    const trophy: TrophyHeader | undefined | null =
      await this.databaseTimeout.run(this.trophies.findById(trophyId), null);
    if (trophy === null) {
      return DEEPDIVE_TROPHY_TIMEOUT_MESSAGE;
    }
    if (trophy === undefined) {
      return DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE;
    }

    // Both recipient queries share one timeout message: they are two halves
    // of the same "who has won this?" answer, and telling the reader which of
    // them was slow would not help them.
    const total: number | null = await this.databaseTimeout.run(
      this.trophyAwards.countRecipients(trophyId),
      null,
    );
    if (total === null) {
      return DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE;
    }

    // A confirmed zero-recipient trophy has nothing left to list, so skip the
    // list query entirely rather than let an unnecessary timeout there turn a
    // known "nobody has won this" answer into a spurious timeout message.
    let shown: TrophyRecipient[] = [];
    if (total > 0) {
      const rows: TrophyRecipient[] | null = await this.databaseTimeout.run(
        this.trophyAwards.listRecipients(trophyId, MAX_TROPHY_RECIPIENTS),
        null,
      );
      if (rows === null) {
        return DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE;
      }
      shown = rows;
    }

    // The query is already capped and ordered most-recent-first, so `shown`
    // holds the newest awards. `total` is the real number of awards, so the
    // remainder below is exact rather than "at least one more". Using
    // `shown.length` (rather than `MAX_TROPHY_RECIPIENTS` directly) keeps this
    // self-maintaining if the query's returned row count ever changes.
    const truncatedCount = total - shown.length;

    const recipientLines =
      total === 0
        ? [DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE]
        : shown.map((recipient) => this.formatRecipient(recipient));
    if (truncatedCount > 0) {
      recipientLines.push(`…and ${truncatedCount} more not shown.`);
    }

    const entries: EntityComponentEntry[] = shown.map((recipient) =>
      this.buildEntry(recipient),
    );
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `Awarded for: ${trophy.competitionGroupName}`,
      ...(trophy.description === null
        ? []
        : [`Description: ${trophy.description}`]),
      '',
      'Recipients:',
      ...recipientLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: trophy.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /** A team trophy names only the team; a player trophy names the player and their team. */
  private formatRecipient(recipient: TrophyRecipient): string {
    return recipient.playerName === null
      ? `${recipient.competitionName}: ${recipient.teamName}`
      : `${recipient.competitionName}: ${recipient.playerName} (${recipient.teamName})`;
  }

  /** Drill down to whoever actually received the trophy. */
  private buildEntry(recipient: TrophyRecipient): EntityComponentEntry {
    return recipient.playerId === null || recipient.playerName === null
      ? {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(recipient.teamId),
          label: recipient.teamName,
        }
      : {
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(recipient.playerId),
          label: recipient.playerName,
        };
  }
}
