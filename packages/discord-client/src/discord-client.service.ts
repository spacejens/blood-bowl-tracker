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
  Optional,
} from '@nestjs/common';
import type {
  ApplicationCommandOptionChoiceData,
  ApplicationCommandOptionData,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageCreateOptions,
  RESTPostAPIChannelMessageJSONBody,
  StringSelectMenuInteraction,
} from 'discord.js';
import {
  ApplicationIntegrationType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  REST,
  Routes,
} from 'discord.js';

import { MemberRoleAccessService } from './member-role-access.service';

export const DISCORD_BOT_TOKEN = Symbol('DISCORD_BOT_TOKEN');

/**
 * The Discord role id members must hold to run a command whose
 * `restrictedRole` is `'debug'` (the bot-development team's maintainer
 * tooling), or `undefined` where the deployment configured none, in which
 * case no restriction is applied. Supplied by the host application, so this
 * package stays free of any configuration concern, exactly like
 * `DISCORD_BOT_TOKEN`.
 */
export const RESTRICTED_COMMAND_ROLE_ID = Symbol('RESTRICTED_COMMAND_ROLE_ID');

/**
 * The same as `RESTRICTED_COMMAND_ROLE_ID`, for commands whose
 * `restrictedRole` is `'admin'` (league-administrator commands). Configured
 * independently, so the two audiences need not overlap.
 */
export const ADMIN_COMMAND_ROLE_ID = Symbol('ADMIN_COMMAND_ROLE_ID');

/** Which configured role a restricted command requires. */
export type RestrictedRole = 'debug' | 'admin';

const READY_TIMEOUT_MS = 30_000;

/** Sent in place of a restricted command's reply when the role is missing. */
const ACCESS_DENIED_MESSAGE = "You don't have permission to use this command.";

/** Recorded as the `error_message` of a refused restricted-command attempt. */
const ACCESS_DENIED_ERROR_MESSAGE = 'Missing required role';

/**
 * `execute` should read only `interaction.options` and return its reply
 * rather than calling `interaction.reply()` itself — replying, logging and
 * usage recording all happen in the dispatcher, after `execute` returns.
 * `apps/discord-bot`'s `/debuginteractions` retrigger button relies on this:
 * it calls a registered `execute` directly with a minimal fabricated
 * interaction exposing only `options`, bypassing the dispatcher entirely. A
 * command that reads `.user`, `.member`, `.guild` or `.channel` would throw
 * when retriggered.
 */
export interface SlashCommandDefinition {
  name: string;
  description: string;
  options?: ApplicationCommandOptionData[];
  /**
   * Opt in to one of the deployment's role restrictions: when the named
   * role kind has a role id configured, only a guild member holding it may
   * run this command, and anyone else — including anyone invoking it in a
   * DM, where there is no guild role to check — gets an ephemeral refusal
   * instead. A role kind with no configured id leaves the command open.
   * Deliberately an explicit per-command setting rather than a name-prefix
   * rule, so the naming convention and the access rule stay independent.
   */
  restrictedRole?: RestrictedRole;
  /**
   * For a command whose `execute` can outlast Discord's 3-second window for
   * acknowledging an interaction (e.g. one that fetches from another site):
   * the dispatcher acknowledges with an ephemeral deferred reply before
   * calling `execute`, then edits that reply with `execute`'s result. The
   * reply is therefore always ephemeral, whatever flags `execute` returns.
   */
  deferEphemeral?: boolean;
  execute: (
    interaction: ChatInputCommandInteraction,
  ) => Promise<string | InteractionReplyOptions>;
  autocomplete?: (
    interaction: AutocompleteInteraction,
  ) => Promise<ApplicationCommandOptionChoiceData[]>;
}

/**
 * Should read only `interaction.customId`, for the same reason described on
 * `SlashCommandDefinition`: the `/debuginteractions` retrigger button calls a
 * registered handler directly with a fabricated interaction exposing only
 * `customId`.
 */
export type ButtonHandler = (
  interaction: ButtonInteraction,
) => Promise<string | InteractionReplyOptions>;

/**
 * Should read only `interaction.customId` and `interaction.values`, for the
 * same reason described on `SlashCommandDefinition`.
 */
export type SelectMenuHandler = (
  interaction: StringSelectMenuInteraction,
) => Promise<string | InteractionReplyOptions>;

/**
 * Receives every message created in a channel the bot can see. Handlers are
 * dispatched in registration order and are independent: one that rejects is
 * logged and does not stop the others. Unlike the interaction handlers there
 * is no prefix routing — a message carries nothing to route on, so each
 * handler filters for the messages it cares about itself (by channel id, by
 * `webhookId`, and so on).
 */
export type MessageHandler = (message: Message) => Promise<void>;

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
  private readonly commandHandlers = new Map<string, SlashCommandDefinition>();
  private readonly autocompleteHandlers = new Map<
    string,
    NonNullable<SlashCommandDefinition['autocomplete']>
  >();
  private readonly buttonHandlers = new Map<string, ButtonHandler>();
  private readonly selectMenuHandlers = new Map<string, SelectMenuHandler>();
  private readonly messageHandlers: MessageHandler[] = [];

  constructor(
    @Inject(DISCORD_BOT_TOKEN) private readonly token: string,
    @Optional()
    @Inject(RESTRICTED_COMMAND_ROLE_ID)
    private readonly debugRoleId: string | undefined,
    @Optional()
    @Inject(ADMIN_COMMAND_ROLE_ID)
    private readonly adminRoleId: string | undefined,
    private readonly memberRoleAccess: MemberRoleAccessService,
    private readonly usageTracking: UsageTrackingService,
  ) {
    // GuildMessages delivers messageCreate at all; MessageContent is the
    // privileged intent that ungates the content and embeds of messages the
    // bot did not author. Both are needed to read another integration's
    // webhook posts, and MessageContent must additionally be enabled on the
    // application in the Discord Developer Portal — declaring it here
    // without that toggle enabled makes Discord reject the gateway
    // connection outright (a `DisallowedIntents` error), so the bot fails to
    // connect at all, not just receive stripped-down messages.
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
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
    this.client.on('messageCreate', (message) => {
      this.handleMessage(message).catch((error) => {
        this.logger.error(
          'Unexpected error dispatching message handlers',
          error,
        );
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
      this.commandHandlers.set(command.name, command);
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

  /**
   * Registers a handler invoked for every message the bot can see. Deliberately
   * unfiltered: filtering is the handler's own job, because different features
   * care about different channels and message sources.
   */
  registerMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * The button handler a given `customId` would route to, matched by the same
   * first-registered-prefix-wins rule the live dispatcher uses. Exposed so a
   * caller can invoke a component's handler without a real Discord event —
   * which is how `/debuginteractions` retriggers a recorded past button.
   */
  findButtonHandler(customId: string): ButtonHandler | undefined {
    return this.matchHandler(this.buttonHandlers, customId)?.handler;
  }

  /** The select-menu equivalent of `findButtonHandler`. */
  findSelectMenuHandler(customId: string): SelectMenuHandler | undefined {
    return this.matchHandler(this.selectMenuHandlers, customId)?.handler;
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
    const definition = this.commandHandlers.get(interaction.commandName);
    if (!definition) {
      return;
    }
    if (this.isDenied(definition, interaction)) {
      await interaction.reply(this.accessDeniedReply());
      void this.recordUsage({
        interaction,
        kind: 'command',
        name: interaction.commandName,
        parameters: this.commandParameters(interaction),
        outcome: 'failure',
        errorMessage: ACCESS_DENIED_ERROR_MESSAGE,
      });
      return;
    }
    try {
      if (definition.deferEphemeral) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
      const content = await definition.execute(interaction);
      this.logger.log(
        `Handled /${interaction.commandName} from ${interaction.user.tag} (${interaction.user.id}) in ${this.describeChannel(interaction)} (${interaction.channelId})`,
      );
      await this.sendCommandReply(definition, interaction, content);
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
      await this.sendCommandReply(definition, interaction, 'I am badly hurt');
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
   * Runs every registered handler for one message. A handler that rejects is
   * logged and skipped rather than aborting the rest: the handlers are
   * unrelated features that happen to share the event, so one failing must not
   * silence the others.
   */
  private async handleMessage(message: Message): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        this.logger.error('Unhandled message handler error', error);
      }
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
   * The role id a member must hold to run `definition`: the configured id
   * for its `restrictedRole`, or `undefined` when it opts into no
   * restriction or its role kind has no configured id — in which case it is
   * open to everyone. Public so a caller that runs a command's `execute`
   * outside this dispatcher (the `/debuginteractions` retrigger button)
   * applies exactly the same rule.
   */
  requiredRoleId(definition: SlashCommandDefinition): string | undefined {
    switch (definition.restrictedRole) {
      case 'debug':
        return this.debugRoleId;
      case 'admin':
        return this.adminRoleId;
      default:
        return undefined;
    }
  }

  /**
   * Whether this invocation must be refused: the command opted into a
   * restricted role, this deployment configured an id for it, and the
   * invoking member does not hold it. An unrestricted command, or a
   * deployment with no configured role, is never refused and behaves
   * exactly like an open command.
   *
   * A refusal is still recorded through the usual usage path as a failed
   * command, so it needs no separate telemetry and shows up in the recorded
   * interaction history like any other outcome.
   */
  private isDenied(
    definition: SlashCommandDefinition,
    interaction: ChatInputCommandInteraction,
  ): boolean {
    const roleId = this.requiredRoleId(definition);
    if (roleId === undefined) {
      return false;
    }
    return !this.memberRoleAccess.hasRole(interaction.member, roleId);
  }

  /** The ephemeral refusal sent instead of a restricted command's reply. */
  private accessDeniedReply(): InteractionReplyOptions {
    return {
      content: ACCESS_DENIED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    };
  }

  /**
   * Sends a command's reply: a plain reply, or — for a `deferEphemeral`
   * command, which was already acknowledged — an edit of the deferred reply.
   */
  private async sendCommandReply(
    definition: SlashCommandDefinition,
    interaction: ChatInputCommandInteraction,
    content: string | InteractionReplyOptions,
  ): Promise<void> {
    if (!definition.deferEphemeral) {
      await interaction.reply(content);
      return;
    }
    await interaction.editReply(this.toEditReply(content));
  }

  /**
   * A reply reshaped for `editReply`: a deferred reply's visibility was
   * fixed when it was deferred and `editReply` does not take reply-only
   * flags, so only the message body is kept.
   */
  private toEditReply(
    content: string | InteractionReplyOptions,
  ): string | InteractionEditReplyOptions {
    if (typeof content === 'string') {
      return content;
    }
    return {
      content: content.content,
      embeds: content.embeds,
      components: content.components,
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
