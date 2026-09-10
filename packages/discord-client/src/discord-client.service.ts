import type {
  InteractionParameter,
  RecordInteractionInput,
} from '@blood-bowl-tracker/discord-bot-usage';
import { UsageTrackingService } from '@blood-bowl-tracker/discord-bot-usage';
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
  RESTPostAPIChannelMessageJSONBody,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  ApplicationIntegrationType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
  REST,
  Routes,
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

interface UsageInputOptions {
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction;
  kind: RecordInteractionInput['kind'];
  /** Command name, or the matched component customId prefix. */
  name: string;
  parameters: InteractionParameter[];
  outcome: RecordInteractionInput['outcome'];
  errorMessage?: string;
}

interface ReplyWithHandlerOptions {
  interaction: ButtonInteraction | StringSelectMenuInteraction;
  handle: () => Promise<string | InteractionReplyOptions>;
  /** Human-readable description of the component, for the log line. */
  description: string;
  kind: 'button' | 'select_menu';
  /** The matched customId prefix, which is the catalog entry's name. */
  name: string;
  parameters: InteractionParameter[];
}

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

  constructor(
    @Inject(DISCORD_BOT_TOKEN) private readonly token: string,
    private readonly usageTracking: UsageTrackingService,
  ) {
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
   * Sends a message through Discord's plain REST API, deliberately never
   * through `this.client`. A standby machine must never open a gateway
   * session — it would receive, and race to answer, the same interactions as
   * the elected machine, which is exactly what leader election prevents — but
   * it can still post over REST.
   *
   * The `REST` client is built per call: it is a cheap, stateless object with
   * no connection to open, and this path runs once at standby startup, so
   * caching it as an instance field would buy nothing. If a future caller
   * ever sends repeatedly, promote it to a cached instance field instead —
   * a fresh client per call also means a fresh rate-limit bucket per call,
   * which would lose the shared rate-limit tracking this method exists to
   * gain.
   *
   * Errors propagate to the caller, matching `sendMessage`.
   */
  async sendMessageOverRest(
    channelId: string,
    content: RESTPostAPIChannelMessageJSONBody,
  ): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(this.token);
    await rest.post(Routes.channelMessages(channelId), { body: content });
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
      const match = this.matchHandler(
        this.buttonHandlers,
        interaction.customId,
      );
      if (match) {
        await this.replyWithHandler({
          interaction,
          handle: () => match.handler(interaction),
          description: `button ${interaction.customId}`,
          kind: 'button',
          name: match.prefix,
          parameters: this.componentIdParameters(
            interaction.customId,
            match.prefix,
          ),
        });
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      const match = this.matchHandler(
        this.selectMenuHandlers,
        interaction.customId,
      );
      if (match) {
        await this.replyWithHandler({
          interaction,
          handle: () => match.handler(interaction),
          description: `select menu ${interaction.customId} (${interaction.values.join(', ')})`,
          kind: 'select_menu',
          name: match.prefix,
          parameters: [
            ...this.componentIdParameters(interaction.customId, match.prefix),
            ...interaction.values.map((value) => ({ key: 'value', value })),
          ],
        });
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
      void this.recordUsage({
        interaction,
        kind: 'command',
        name: interaction.commandName,
        parameters: this.commandParameters(interaction),
        outcome: 'success',
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle /${interaction.commandName} command`,
        error,
      );
      await interaction.reply('I am badly hurt');
      void this.recordUsage({
        interaction,
        kind: 'command',
        name: interaction.commandName,
        parameters: this.commandParameters(interaction),
        outcome: 'failure',
        errorMessage: this.errorMessage(error),
      });
    }
  }

  /**
   * Records one handled interaction, best-effort. Deliberately swallows its
   * own failure: the user has already been replied to by the time this runs,
   * and a telemetry write must never turn a working command into a broken one.
   * Callers fire it with `void` rather than awaiting it.
   */
  private async recordUsage(options: UsageInputOptions): Promise<void> {
    try {
      await this.usageTracking.recordInteraction(this.buildUsageInput(options));
    } catch (error) {
      this.logger.warn('Failed to record usage event', error);
    }
  }

  /** Extracts the Discord context every recorded interaction shares. */
  private buildUsageInput(options: UsageInputOptions): RecordInteractionInput {
    const { interaction } = options;
    const member = interaction.member;
    return {
      kind: options.kind,
      name: options.name,
      occurredAt: interaction.createdAt,
      discordUserId: interaction.user.id,
      username: interaction.user.username,
      discordGuildId: interaction.guildId ?? undefined,
      guildName: interaction.guild?.name,
      nickname: this.memberNickname(member),
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
   * `interaction.member` is a cached `GuildMember` (field `nickname`) when
   * the guild is already known to the client, or the raw
   * `APIInteractionGuildMember` (field `nick`) otherwise. Both are checked
   * so a nickname is still recorded in the raw-payload case.
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

  /**
   * One parameter row per supplied slash-command option. A non-string option
   * value (a number, a boolean, a resolved snowflake) is stringified, since
   * the column is text.
   *
   * Reads `interaction.options.data` one level deep only: no command
   * registered today uses subcommands or subcommand groups. A command that
   * did would have its actual options nested under a single
   * subcommand-named entry here instead of recorded directly.
   */
  private commandParameters(
    interaction: ChatInputCommandInteraction,
  ): InteractionParameter[] {
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

  /** The message of a caught error, for the `error_message` column. */
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** First registered prefix that `customId` starts with, with its handler. */
  private matchHandler<T>(
    handlers: Map<string, T>,
    customId: string,
  ): { prefix: string; handler: T } | undefined {
    const entry = [...handlers.entries()].find(([prefix]) =>
      customId.startsWith(prefix),
    );
    return entry ? { prefix: entry[0], handler: entry[1] } : undefined;
  }

  /**
   * Runs a component handler and replies with its output, logging the handled
   * component or falling back to the hurt message when the handler throws, and
   * recording the interaction either way. Shared by the button and select-menu
   * branches.
   */
  private async replyWithHandler(
    options: ReplyWithHandlerOptions,
  ): Promise<void> {
    const { interaction, kind, name, parameters } = options;
    try {
      const content = await options.handle();
      this.logger.log(
        `Handled ${options.description} from ${interaction.user.tag} (${interaction.user.id}) in ${this.describeChannel(interaction)} (${interaction.channelId})`,
      );
      await interaction.reply(content);
      void this.recordUsage({
        interaction,
        kind,
        name,
        parameters,
        outcome: 'success',
      });
    } catch (error) {
      this.logger.error(`Failed to handle ${options.description}`, error);
      await interaction.reply('I am badly hurt');
      void this.recordUsage({
        interaction,
        kind,
        name,
        parameters,
        outcome: 'failure',
        errorMessage: this.errorMessage(error),
      });
    }
  }

  /**
   * The dynamic remainder of a component's customId after the prefix that
   * matched it — the per-instance payload the handler routes on. A customId
   * that is exactly the prefix carries no payload and records no parameter.
   */
  private componentIdParameters(
    customId: string,
    prefix: string,
  ): InteractionParameter[] {
    const remainder = customId.slice(prefix.length);
    return remainder === '' ? [] : [{ key: 'id', value: remainder }];
  }

  private describeChannel(interaction: Interaction): string {
    if (interaction.channel && 'name' in interaction.channel) {
      return interaction.channel.name ?? 'unknown channel';
    }
    return 'unknown channel';
  }
}
