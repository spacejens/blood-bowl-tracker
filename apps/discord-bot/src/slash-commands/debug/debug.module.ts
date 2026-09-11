import { DiscordBotUsageModule } from '@blood-bowl-tracker/discord-bot-usage';
import {
  CoachesModule,
  CompetitionGroupsModule,
  CompetitionsModule,
  ErasModule,
  LeaguesModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  TeamsModule,
  TrophiesModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { SlashCommandRegistryModule } from '../slash-command-registry.module';
import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';
import { DebugInteractionsCommandService } from './debug-interactions-command.service';
import { OptionValueResolverService } from './option-value-resolver.service';

/**
 * `/debuginteractions` is the first of several `debug`-prefixed commands
 * planned under #834 (see #836/#837/#838); grouping them here now avoids a
 * bigger reshuffle once the others land.
 *
 * `DiscordBotUsageModule` supplies `InteractionEventsQueryService`. Importing
 * it here (packages/discord-client already imports it for the write side) is
 * safe: Nest instantiates a module once and shares it, and its only
 * dependency - the DB token - is provided globally by `DbModule`.
 *
 * `SlashCommandRegistryModule` supplies the shared `SlashCommandRegistryService`
 * singleton - see that module's doc comment for why it isn't provided
 * directly here or in `SlashCommandsModule`.
 *
 * The game-data modules OptionValueResolverService resolves recorded
 * option ids through. PlayersModule supplies both PlayersService and
 * StarPlayersService; CompetitionGroupsModule's only by-id lookup is
 * findByIdWithLeague.
 */
@Module({
  imports: [
    DiscordBotUsageModule,
    SlashCommandRegistryModule,
    RacesModule,
    ErasModule,
    LeaguesModule,
    CompetitionsModule,
    CompetitionGroupsModule,
    CoachesModule,
    TeamsModule,
    PlayersModule,
    PositionsModule,
    TrophiesModule,
  ],
  providers: [
    DebugInteractionsCommandService,
    DebugInteractionRowFormatterService,
    OptionValueResolverService,
  ],
})
export class DebugModule {}
