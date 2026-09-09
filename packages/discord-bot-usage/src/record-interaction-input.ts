import type {
  InteractionKind,
  InteractionOutcome,
} from '@blood-bowl-tracker/db';

/** One command option, or one component value, as recorded against an event. */
export interface InteractionParameter {
  key: string;
  /** Absent when the interaction carried the key but no value for it. */
  value?: string;
}

/**
 * Everything needed to record one interaction, expressed in plain data rather
 * than discord.js types. That is what keeps this package free of a discord.js
 * dependency: the caller does the extraction, this package does the storing.
 */
export interface RecordInteractionInput {
  kind: InteractionKind;
  /** Command name, or the matched button/select-menu customId prefix. */
  name: string;
  occurredAt: Date;
  discordUserId: string;
  username: string;
  /** Absent in a DM, which belongs to no guild. */
  discordGuildId?: string;
  guildName?: string;
  /** The user's per-guild nickname, when they have one. */
  nickname?: string;
  discordChannelId: string;
  channelName?: string;
  outcome: InteractionOutcome;
  /** Set only when `outcome` is `'failure'`. */
  errorMessage?: string;
  parameters: InteractionParameter[];
}
