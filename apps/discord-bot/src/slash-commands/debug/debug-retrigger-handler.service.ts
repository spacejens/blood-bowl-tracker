import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { InteractionEventsQueryService } from '@blood-bowl-tracker/discord-bot-usage';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { MessageFlags } from 'discord.js';

import {
  DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE,
  DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE,
} from '../../error-messages';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DEBUG_RETRIGGER_CUSTOM_ID_PREFIX } from './debug-custom-ids';

/**
 * Re-runs an interaction listed by `/debuginteractions`, so a maintainer
 * diagnosing an "it failed for me" report can see for themselves whether it
 * still reproduces, without asking the original user to repeat what they did.
 *
 * The registered handler is invoked *directly*, not through
 * `DiscordClientService.handleInteraction`. That is safe because every real
 * slash command's `execute` reads only `interaction.options`, every button
 * handler only `interaction.customId`, and every select-menu handler only
 * `interaction.values` - replying, logging and usage recording are all
 * dispatcher concerns. So a minimal synthetic object exposing just those
 * properties is enough.
 *
 * It also means the retriggered invocation writes no `discord_bot_usage` row
 * of its own, which is deliberate: the write path lives in the dispatcher,
 * and fabricating guild/channel/member context for a debug action would serve
 * no purpose. (The retrigger button click itself is still recorded like any
 * other button, since this is a normally-registered button handler.)
 *
 * The retriggered reply is returned unchanged, so the dispatcher posts it
 * non-ephemerally into the channel the retrigger was clicked in - matching how
 * the original command or component would have replied. Only this service's
 * own two error replies are ephemeral.
 */
@Injectable()
export class DebugRetriggerHandlerService implements OnModuleInit {
  constructor(
    private readonly events: InteractionEventsQueryService,
    private readonly registry: SlashCommandRegistryService,
    private readonly discordClient: DiscordClientService,
  ) {}

  onModuleInit(): void {
    this.discordClient.registerButtonHandler(
      DEBUG_RETRIGGER_CUSTOM_ID_PREFIX,
      (interaction) => this.handle(interaction),
    );
  }

  async handle(
    interaction: ButtonInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const eventId = Number(
      interaction.customId.slice(DEBUG_RETRIGGER_CUSTOM_ID_PREFIX.length),
    );
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return this.ephemeral(DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE);
    }
    const event = await this.events.findById(eventId);
    if (event === undefined) {
      return this.ephemeral(DEBUG_RETRIGGER_EVENT_NOT_FOUND_MESSAGE);
    }
    if (event.kind === 'command') {
      return this.retriggerCommand(event);
    }
    if (event.kind === 'button') {
      return this.retriggerButton(event);
    }
    return this.retriggerSelectMenu(event);
  }

  private retriggerCommand(
    event: InteractionEventRow,
  ): Promise<string | InteractionReplyOptions> {
    const definition = this.registry.findByName(event.name);
    if (definition === undefined) {
      return Promise.resolve(
        this.ephemeral(DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE),
      );
    }
    const optionsByName = new Map(
      event.parameters.map((parameter) => [parameter.key, parameter.value]),
    );
    // `getUser` is stubbed as well as `getString`: no real command reads a
    // `User`-type option today except `/debuginteractions` itself (which
    // appears in its own listing, so retriggering that row must not throw),
    // but the recorded value is the option's raw snowflake, so it is
    // resolved into a minimal `User` stand-in rather than dropped - a
    // recorded `user` filter must survive retriggering unchanged.
    const synthetic = {
      options: {
        getString: (name: string) => optionsByName.get(name) ?? null,
        getUser: (name: string) => {
          const id = optionsByName.get(name);
          return id == null ? null : ({ id } as User);
        },
      },
    } as unknown as ChatInputCommandInteraction;
    return definition.execute(synthetic);
  }

  private retriggerButton(
    event: InteractionEventRow,
  ): Promise<string | InteractionReplyOptions> {
    const customId = this.componentCustomId(event);
    const handler = this.discordClient.findButtonHandler(customId);
    if (handler === undefined) {
      return Promise.resolve(
        this.ephemeral(DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE),
      );
    }
    return handler({ customId } as unknown as ButtonInteraction);
  }

  private retriggerSelectMenu(
    event: InteractionEventRow,
  ): Promise<string | InteractionReplyOptions> {
    const customId = this.componentCustomId(event);
    const handler = this.discordClient.findSelectMenuHandler(customId);
    if (handler === undefined) {
      return Promise.resolve(
        this.ephemeral(DEBUG_RETRIGGER_HANDLER_NOT_FOUND_MESSAGE),
      );
    }
    const selectedValues = event.parameters
      .filter((parameter) => parameter.key === 'value')
      .map((parameter) => parameter.value ?? '');
    return handler({
      customId,
      values: selectedValues,
    } as unknown as StringSelectMenuInteraction);
  }

  /**
   * The component's original customId: the recorded interaction type name is
   * the matched prefix, and the `id` parameter is the dynamic remainder the
   * dispatcher split off. A component whose customId was exactly the prefix
   * recorded no `id` parameter at all.
   */
  private componentCustomId(event: InteractionEventRow): string {
    const id = event.parameters.find((parameter) => parameter.key === 'id');
    return `${event.name}${id?.value ?? ''}`;
  }

  private ephemeral(content: string): InteractionReplyOptions {
    return { content, flags: MessageFlags.Ephemeral };
  }
}
