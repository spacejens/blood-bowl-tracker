/** One command option, or one component value, of a handled interaction. */
export interface HandledInteractionParameter {
  key: string;
  /** Absent when the interaction carried the key but no value for it. */
  value?: string;
}

/**
 * One handled slash command, button click or select-menu selection,
 * expressed in plain data rather than discord.js types, so a listener needs
 * no knowledge of discord.js.
 */
export interface HandledInteraction {
  kind: 'command' | 'button' | 'select_menu';
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
  outcome: 'success' | 'failure';
  /** Set only when `outcome` is `'failure'`. */
  errorMessage?: string;
  parameters: HandledInteractionParameter[];
}

/**
 * Told about each handled interaction, after the user has been replied to.
 * The dispatcher does not await it: a rejection is logged as a warning and
 * affects neither the reply nor any other listener.
 */
export type InteractionHandledListener = (
  interaction: HandledInteraction,
) => Promise<void>;
