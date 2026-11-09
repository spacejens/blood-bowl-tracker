import { DiscordBotUsageModule } from '@blood-bowl-tracker/discord-bot-usage';
import {
  CompetitionsModule,
  ErasModule,
  LeaguesModule,
  TrophiesModule,
} from '@blood-bowl-tracker/game-data';
import {
  CoachesQueriesModule,
  CompetitionGroupsQueriesModule,
  PlayersQueriesModule,
  PositionsQueriesModule,
  RacesQueriesModule,
  TeamsQueriesModule,
} from '@blood-bowl-tracker/game-data-queries';
import { Module } from '@nestjs/common';

import { SlashCommandRegistryModule } from '../slash-command-registry.module';
import { DebugFilterUsageCommandService } from './debug-filter-usage-command.service';
import { DebugIncompleteImportCommandService } from './debug-incomplete-import-command.service';
import { DebugIncompleteImportPageHandlerService } from './debug-incomplete-import-page-handler.service';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';
import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';
import { DebugInteractionsCommandService } from './debug-interactions-command.service';
import { DebugRetriggerButtonsService } from './debug-retrigger-buttons.service';
import { DebugRetriggerHandlerService } from './debug-retrigger-handler.service';
import { DebugTopUsersCommandService } from './debug-top-users-command.service';
import { FilterUsageReportService } from './filter-usage-report.service';
import { IncompleteImportReportService } from './incomplete-import-report.service';
import { OptionValueResolverService } from './option-value-resolver.service';

/**
 * Groups the `debug`-prefixed commands - `/debuginteractions` (with its
 * retrigger buttons), `/debugtopusers`, `/debugfilterusage` and
 * `/debugincompleteimport` (with its page buttons) - so they share one
 * module.
 *
 * `DiscordBotUsageModule` supplies `InteractionEventsQueryService`. Importing
 * it here (`UsageRecordingModule` also imports it, for the write side) is
 * safe: Nest instantiates a module once and shares it, and its only
 * dependency - the DB token - is provided globally by `DbModule`.
 *
 * `SlashCommandRegistryModule` supplies the shared `SlashCommandRegistryService`
 * singleton - see that module's doc comment for why it isn't provided
 * directly here or in `SlashCommandsModule`.
 *
 * The game-data modules OptionValueResolverService resolves recorded
 * option ids through. PlayersQueriesModule supplies PlayersQueriesService,
 * StarPlayersService and IncompleteImportPlayersService (for
 * /debugincompleteimport);
 * CompetitionGroupsQueriesModule's only by-id lookup is findByIdWithLeague.
 */
@Module({
  imports: [
    DiscordBotUsageModule,
    SlashCommandRegistryModule,
    RacesQueriesModule,
    ErasModule,
    LeaguesModule,
    CompetitionsModule,
    CompetitionGroupsQueriesModule,
    CoachesQueriesModule,
    TeamsQueriesModule,
    PlayersQueriesModule,
    PositionsQueriesModule,
    TrophiesModule,
  ],
  providers: [
    DebugInteractionsCommandService,
    DebugInteractionRowFormatterService,
    DebugRetriggerButtonsService,
    DebugRetriggerHandlerService,
    DebugTopUsersCommandService,
    DebugFilterUsageCommandService,
    FilterUsageReportService,
    OptionValueResolverService,
    DebugIncompleteImportCommandService,
    DebugIncompleteImportPageHandlerService,
    DebugIncompleteImportReplyService,
    IncompleteImportReportService,
  ],
})
export class DebugModule {}
