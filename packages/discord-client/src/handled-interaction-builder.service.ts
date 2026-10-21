import { Injectable } from '@nestjs/common';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

import type {
  HandledInteraction,
  HandledInteractionParameter,
} from './handled-interaction';

/** What the dispatcher knows about one interaction it has just handled. */
export interface HandledInteractionOptions {
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction;
  kind: HandledInteraction['kind'];
  /** Command name, or the matched component customId prefix. */
  name: string;
  parameters: HandledInteractionParameter[];
  outcome: HandledInteraction['outcome'];
  errorMessage?: string;
}

/**
 * Turns a discord.js interaction into the plain-data `HandledInteraction`
 * that interaction-handled listeners receive. The extraction lives in this
 * package because only it knows discord.js types; listeners never see them.
 */
@Injectable()
export class HandledInteractionBuilderService {
  /** Extracts the Discord context every handled interaction shares. */
  build(options: HandledInteractionOptions): HandledInteraction {
    const { interaction } = options;
    return {
      kind: options.kind,
      name: options.name,
      occurredAt: interaction.createdAt,
      discordUserId: interaction.user.id,
      username: interaction.user.username,
      discordGuildId: interaction.guildId ?? undefined,
      guildName: interaction.guild?.name,
      nickname: this.memberNickname(interaction.member),
      discordChannelId: interaction.channelId,
      channelName:
        interaction.channel && 'name' in interaction.channel
          ? (interaction.channel.name ?? undefined)
          : undefined,
      outcome: options.outcome,
      errorMessage: options.errorMessage,
      parameters: options.parameters,
    };
  }

  /**
   * One parameter per supplied slash-command option. A non-string option
   * value (a number, a boolean, a resolved snowflake) is stringified, so
   * every parameter value is text.
   *
   * Reads `interaction.options.data` one level deep only: no command
   * registered today uses subcommands or subcommand groups. A command that
   * did would have its actual options nested under a single
   * subcommand-named entry here instead of reported directly.
   */
  commandParameters(
    interaction: ChatInputCommandInteraction,
  ): HandledInteractionParameter[] {
    return interaction.options.data.map((option) => ({
      key: option.name,
      value:
        option.value === undefined
          ? undefined
          : typeof option.value === 'string'
            ? option.value
            : JSON.stringify(option.value),
    }));
  }

  /**
   * The dynamic remainder of a component's customId after the prefix that
   * matched it — the per-instance payload the handler routes on. A customId
   * that is exactly the prefix carries no payload and yields no parameter.
   */
  componentIdParameters(
    customId: string,
    prefix: string,
  ): HandledInteractionParameter[] {
    const remainder = customId.slice(prefix.length);
    return remainder === '' ? [] : [{ key: 'id', value: remainder }];
  }

  /**
   * `interaction.member` is a cached `GuildMember` (field `nickname`) when
   * the guild is already known to the client, or the raw
   * `APIInteractionGuildMember` (field `nick`) otherwise. Both are checked
   * so a nickname is still reported in the raw-payload case.
   */
  private memberNickname(
    member: ChatInputCommandInteraction['member'],
  ): string | undefined {
    if (!member) {
      return undefined;
    }
    if ('nickname' in member) {
      return member.nickname ?? undefined;
    }
    if ('nick' in member) {
      return member.nick ?? undefined;
    }
    return undefined;
  }
}
