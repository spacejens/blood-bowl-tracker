import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  ApplicationCommandOptionChoiceData,
  ApplicationCommandOptionData,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  InteractionReplyOptions,
  MessageCreateOptions,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  ApplicationIntegrationType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
} from 'discord.js';

export const DISCORD_BOT_TOKEN = Symbol('DISCORD_BOT_TOKEN');

const READY_TIMEOUT_MS = 30_000;

export interface SlashCommandDefinition {
  name: string;
  description: string;
  options?: ApplicationCommandOptionData[];
  execute: (
    interaction: ChatInputCommandInteraction,
  ) => Promise<string | InteractionReplyOptions>;
  autocomplete?: (
    interaction: AutocompleteInteraction,
  ) => Promise<ApplicationCommandOptionChoiceData[]>;
}

export type ButtonHandler = (
  interaction: ButtonInteraction,
) => Promise<string | InteractionReplyOptions>;

export type SelectMenuHandler = (
  interaction: StringSelectMenuInteraction,
) => Promise<string | InteractionReplyOptions>;

@Injectable()
export class DiscordClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordClientService.name);
  private readonly client: Client;
  private readonly commandHandlers = new Map<
    string,
    SlashCommandDefinition['execute']
  >();
  private readonly autocompleteHandlers = new Map<
    string,
    NonNullable<SlashCommandDefinition['autocomplete']>
  >();
  private readonly buttonHandlers = new Map<string, ButtonHandler>();
  private readonly selectMenuHandlers = new Map<string, SelectMenuHandler>();

  constructor(@Inject(DISCORD_BOT_TOKEN) private readonly token: string) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
  }

  /**
   * Only wires up event listeners. Logging in is deliberately NOT done here:
   * two machines run this app at once and only the one that wins leader
   * election may open a gateway session, since Discord delivers every gateway
   * event to every connected session of an unsharded bot. The elected machine
   * calls `connect()` explicitly.
   */
  onModuleInit(): void {
    this.client.on('error', (error) => {
      this.logger.error('Discord client error', error);
    });
    this.client.on('interactionCreate', (interaction) => {
      this.handleInteraction(interaction).catch((error) => {
        this.logger.error('Unhandled interaction error', error);
      });
    });
  }

  /**
   * Opens the gateway session and resolves once the client is ready. Called
   * exactly once, by the leader-election service, after this instance wins the
   * advisory lock. Rejecting here is recoverable — the caller releases the
   * lock and re-enters the election rather than crashing the process — but
   * only if the login is actually abandoned first: a bare timeout would leave
   * `login()` in flight, and a login that later succeeds after this machine
   * has already released the lock (and a standby has become active) opens the
   * exact duplicate gateway session leader election exists to prevent. Both
   * the timeout and the `ready` listener are torn down here so neither can
   * fire after this method has settled.
   */
  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        clearTimeout(timeout);
        this.logger.log(`Logged in as ${this.client.user?.tag ?? 'unknown'}`);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.client.off('ready', onReady);
        void this.client.destroy();
        reject(
          new Error(
            `Discord client did not become ready within ${READY_TIMEOUT_MS}ms`,
          ),
        );
      }, READY_TIMEOUT_MS);
      this.client.once('ready', onReady);
      this.client.login(this.token).catch((error: unknown) => {
        clearTimeout(timeout);
        this.client.off('ready', onReady);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.destroy();
  }

  async sendMessage(
    channelId: string,
    content: string | InteractionReplyOptions,
  ): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Discord channel not found: ${channelId}`);
    }
    if (!channel.isSendable()) {
      throw new Error(`Discord channel is not sendable: ${channelId}`);
    }
    await channel.send(content as string | MessageCreateOptions);
  }

  /**
   * Registers slash commands globally, so they work both in every server the
   * bot belongs to and in DMs with the bot. `contexts` is what makes a command
   * usable in a DM; `integrationTypes` keeps the guild-install model, so a
   * user still has to share a server with the bot to DM it.
   *
   * Also clears each joined guild's own command list, which removes the
   * guild-scoped copies registered before commands went global — otherwise a
   * guild would show two of every command. This runs on every startup, so it
   * is self-healing for any guild the bot is or becomes a member of. Cleanup
   * is best-effort: a failure for one guild is logged and does not prevent
   * cleanup of the rest, since global registration (the essential step) has
   * already succeeded by this point.
   *
   * `application.commands.set` REPLACES the application's entire command list,
   * so all slash commands across the application must be registered via a
   * single call to this method. If another service calls `registerCommands`
   * separately, it will wipe out the commands registered by a previous call.
   *
   * Going global costs propagation speed: Discord can take up to ~1 hour to
   * show a changed command definition (name, description, options), where
   * guild-scoped updates were near-instant. Handler behaviour is unaffected
   * and changes as soon as the bot redeploys.
   */
  async registerCommands(commands: SlashCommandDefinition[]): Promise<void> {
    for (const command of commands) {
      this.commandHandlers.set(command.name, command.execute);
      if (command.autocomplete) {
        this.autocompleteHandlers.set(command.name, command.autocomplete);
      }
    }
    const commandData = commands.map((command) => ({
      name: command.name,
      description: command.description,
      ...(command.options ? { options: command.options } : {}),
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
      integrationTypes: [ApplicationIntegrationType.GuildInstall],
    }));
    // `application` is only null before the client is ready, and this method
    // is always called after `connect()` awaited the `ready` event.
    await this.client.application!.commands.set(commandData);
    for (const guild of this.client.guilds.cache.values()) {
      try {
        await guild.commands.set([]);
      } catch (error) {
        this.logger.warn(
          `Failed to clear guild-scoped commands for guild ${guild.id}`,
          error,
        );
      }
    }
  }

  /**
   * Registers a handler for button interactions whose `customId` starts with
   * `prefix`. Prefixes are matched with `startsWith`, first match wins, so
   * distinct features must use non-overlapping prefixes (e.g. `deepdive:era:`).
   */
  registerButtonHandler(prefix: string, handler: ButtonHandler): void {
    this.buttonHandlers.set(prefix, handler);
  }

  /**
   * Registers a handler for string-select-menu interactions whose `customId`
   * starts with `prefix`. Matched exactly like `registerButtonHandler`, and
   * deliberately using the same prefixes: a menu's customId is
   * `<prefix>menu:<index>`, so one feature's buttons and menus route to the
   * same place without a second prefix scheme.
   */
  registerSelectMenuHandler(prefix: string, handler: SelectMenuHandler): void {
    this.selectMenuHandlers.set(prefix, handler);
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      const autocomplete = this.autocompleteHandlers.get(
        interaction.commandName,
      );
      if (!autocomplete) {
        return;
      }
      const choices = await autocomplete(interaction);
      await interaction.respond(choices);
      return;
    }
    if (interaction.isButton()) {
      const handler = this.matchHandler(
        this.buttonHandlers,
        interaction.customId,
      );
      if (handler) {
        await this.replyWithHandler(
          interaction,
          () => handler(interaction),
          `button ${interaction.customId}`,
        );
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      const handler = this.matchHandler(
        this.selectMenuHandlers,
        interaction.customId,
      );
      if (handler) {
        await this.replyWithHandler(
          interaction,
          () => handler(interaction),
          `select menu ${interaction.customId} (${interaction.values.join(', ')})`,
        );
      }
      return;
    }
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const handler = this.commandHandlers.get(interaction.commandName);
    if (!handler) {
      return;
    }
    try {
      const content = await handler(interaction);
      this.logger.log(
        `Handled /${interaction.commandName} from ${interaction.user.tag} (${interaction.user.id}) in ${this.describeChannel(interaction)} (${interaction.channelId})`,
      );
      await interaction.reply(content);
    } catch (error) {
      this.logger.error(
        `Failed to handle /${interaction.commandName} command`,
        error,
      );
      await interaction.reply('I am badly hurt');
    }
  }

  /** First registered prefix that `customId` starts with, if any. */
  private matchHandler<T>(
    handlers: Map<string, T>,
    customId: string,
  ): T | undefined {
    const entry = [...handlers.entries()].find(([prefix]) =>
      customId.startsWith(prefix),
    );
    return entry?.[1];
  }

  /**
   * Runs a component handler and replies with its output, logging the handled
   * component (described by `description`) or falling back to the hurt message
   * when the handler throws. Shared by the button and select-menu branches.
   */
  private async replyWithHandler(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    handle: () => Promise<string | InteractionReplyOptions>,
    description: string,
  ): Promise<void> {
    try {
      const content = await handle();
      this.logger.log(
        `Handled ${description} from ${interaction.user.tag} (${interaction.user.id}) in ${this.describeChannel(interaction)} (${interaction.channelId})`,
      );
      await interaction.reply(content);
    } catch (error) {
      this.logger.error(`Failed to handle ${description}`, error);
      await interaction.reply('I am badly hurt');
    }
  }

  private describeChannel(interaction: Interaction): string {
    if (interaction.channel && 'name' in interaction.channel) {
      return interaction.channel.name ?? 'unknown channel';
    }
    return 'unknown channel';
  }
}
