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
  DEEPDIVE_TROPHY_RECIPIENT_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { PlayerContextService } from '../../insights/player-context.service';
import { TeamContextService } from '../../insights/team-context.service';
import { EraSectionGrouperService } from '../../shared/era-section-grouper.service';
import {
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
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

/** A recipient's decorated race/coach (team) or position/team/race/coach (player) suffix, keyed by the id `formatRecipient` looks it up with. */
type RecipientContext = {
  teamSuffixes: Map<number, string>;
  playerSuffixes: Map<number, string>;
};

/**
 * Composes one trophy's header (which competition group awards it, and its
 * criteria) and every recipient it has ever had, most recent competition
 * first. Shared by `/deepdive trophy:<id>` and the trophy deepdive buttons.
 * Each DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" (`undefined`). Each
 * recipient becomes a drill-down entry — the team for a team trophy, the
 * player for a player trophy — and the competition is deliberately not linked.
 * Recipient lines are decorated with the same race/coach (team) or
 * position/team/race/coach (player) context the toplist insights show, so
 * a reader can identify a recipient they do not know by name — see
 * `TeamContextService`/`PlayerContextService`.
 * Recipients are rendered in per-era sections, each headed `<era> recipients:`, most recent era first — so the era is named once per section instead of on every player row.
 */
@Injectable()
export class TrophyDeepdiveService {
  constructor(
    private readonly trophies: TrophiesService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly teamContext: TeamContextService,
    private readonly playerContext: PlayerContextService,
    private readonly eraSectionGrouper: EraSectionGrouperService,
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

    // No recipients means nothing left to decorate, so skip the context
    // lookup entirely — same reasoning as skipping the list query above:
    // an unnecessary timeout here must not turn a known "nobody has won
    // this" answer into a spurious timeout message.
    let context: RecipientContext = {
      teamSuffixes: new Map(),
      playerSuffixes: new Map(),
    };
    if (shown.length > 0) {
      // Team and player context lookups share one timeout message for the
      // same reason the recipient queries above do: they are two halves of
      // decorating whatever recipients were found.
      const resolvedContext: RecipientContext | null =
        await this.databaseTimeout.run(this.buildRecipientContext(shown), null);
      if (resolvedContext === null) {
        return DEEPDIVE_TROPHY_RECIPIENT_CONTEXT_TIMEOUT_MESSAGE;
      }
      context = resolvedContext;
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
        : this.eraSectionGrouper
            .group(shown)
            .flatMap((section) => [
              `${section.eraName} recipients:`,
              ...section.rows.map((recipient) =>
                this.formatRecipient(recipient, context),
              ),
            ]);
    if (truncatedCount > 0) {
      recipientLines.push(`…and ${truncatedCount} more not shown.`);
    }

    // Recipient entries first: buildEntityComponents has no internal
    // prioritisation (first-N / first-group wins), so the recipients keep
    // button/select-menu priority over the drill-up to the competition group.
    const entries: EntityComponentEntry[] = [
      ...shown.map((recipient) => this.buildEntry(recipient)),
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(trophy.competitionGroupId),
        label: trophy.competitionGroupName,
      },
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `Awarded for: ${trophy.competitionGroupName}`,
      ...(trophy.description === null
        ? []
        : [`Description: ${trophy.description}`]),
      '',
      ...recipientLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: trophy.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /**
   * Batches the race/coach lookup for every team recipient and the
   * position/team/race/coach lookup for every player recipient into a
   * suffix map each, so `formatRecipient` is a plain lookup. Run as one
   * `Promise.all` (rather than two separate `databaseTimeout.run` calls) since
   * a trophy's recipients are always one kind or the other, so only one of the
   * two lookups ever does real work.
   */
  private async buildRecipientContext(
    recipients: TrophyRecipient[],
  ): Promise<RecipientContext> {
    const teamRows = recipients.filter((row) => this.isTeamRecipient(row));
    const playerRows = recipients.filter((row) => !this.isTeamRecipient(row));
    const [decoratedTeams, decoratedPlayers] = await Promise.all([
      this.teamContext.attachSuffixes(teamRows, (row) => row.teamId, {
        includeRace: true,
        includeCoach: true,
      }),
      this.playerContext.attachSuffixes(
        playerRows,
        (row) => row.playerId as number,
        {
          includePosition: true,
          includeTeam: true,
          includeRace: true,
          includeEra: false,
          includeCoach: true,
        },
      ),
    ]);
    return {
      teamSuffixes: new Map(
        decoratedTeams.map((row) => [row.teamId, row.contextSuffix]),
      ),
      playerSuffixes: new Map(
        decoratedPlayers.map((row) => [
          row.playerId as number,
          row.contextSuffix,
        ]),
      ),
    };
  }

  /**
   * A team trophy names the team with its race/coach context; a player
   * trophy names the player with their position/team/race/coach context.
   */
  private formatRecipient(
    recipient: TrophyRecipient,
    context: RecipientContext,
  ): string {
    return this.isTeamRecipient(recipient)
      ? `${recipient.competitionName}: ${recipient.teamName}${context.teamSuffixes.get(recipient.teamId) ?? ''}`
      : `${recipient.competitionName}: ${recipient.playerName}${context.playerSuffixes.get(recipient.playerId as number) ?? ''}`;
  }

  /** Drill down to whoever actually received the trophy. */
  private buildEntry(recipient: TrophyRecipient): EntityComponentEntry {
    return this.isTeamRecipient(recipient)
      ? {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(recipient.teamId),
          label: recipient.teamName,
        }
      : {
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(recipient.playerId),
          label: recipient.playerName as string,
        };
  }

  /**
   * A plain boolean (rather than a type guard) so it can gate both the
   * `!isTeamRecipient(...)`-filtered rows above and the ternaries below with
   * one shared predicate. The trade-off: TypeScript can no longer narrow
   * `playerId`/`playerName` from this check alone, so call sites that only
   * run on the "not a team recipient" branch cast them — safe because this
   * method's own definition guarantees both are non-null there.
   */
  private isTeamRecipient(recipient: TrophyRecipient): boolean {
    return recipient.playerId === null || recipient.playerName === null;
  }
}
