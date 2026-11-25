import {
  CliSharedModule,
  DiscordRestModule,
} from '@blood-bowl-tracker/cli-shared';
import { DbModule } from '@blood-bowl-tracker/db';
import { GameRulesModule } from '@blood-bowl-tracker/game-rules';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { ParseTpFeedModule } from '@blood-bowl-tracker/parse-tp-feed';
import { DynamicModule, Module, Provider } from '@nestjs/common';

import { AdvancementFillStageService } from './generate-incomplete-player-fills/advancement-fill-stage.service';
import { CandidateMatchQueriesService } from './generate-incomplete-player-fills/candidate-match-queries.service';
import { CandidateQueriesService } from './generate-incomplete-player-fills/candidate-queries.service';
import { CharacteristicChangeService } from './generate-incomplete-player-fills/characteristic-change.service';
import { CharacteristicReplayService } from './generate-incomplete-player-fills/characteristic-replay.service';
import { CharacteristicValidityService } from './generate-incomplete-player-fills/characteristic-validity.service';
import { EraRulesQueriesService } from './generate-incomplete-player-fills/era-rules-queries.service';
import { FeedOwnerFitService } from './generate-incomplete-player-fills/feed-owner-fit.service';
import { FeedPlayerMatcherService } from './generate-incomplete-player-fills/feed-player-matcher.service';
import { FeedSkillResolverService } from './generate-incomplete-player-fills/feed-skill-resolver.service';
import { FeedSplitSearchService } from './generate-incomplete-player-fills/feed-split-search.service';
import { FillEntryBuilderService } from './generate-incomplete-player-fills/fill-entry-builder.service';
import { FillQueryScopeService } from './generate-incomplete-player-fills/fill-query-scope.service';
import { FillRowShapesService } from './generate-incomplete-player-fills/fill-row-shapes.service';
import { FillSectionRendererService } from './generate-incomplete-player-fills/fill-section-renderer.service';
import { GenerateIncompletePlayerFillsService } from './generate-incomplete-player-fills/generate-incomplete-player-fills.service';
import { IncompletePlayerFillPlannerService } from './generate-incomplete-player-fills/incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './generate-incomplete-player-fills/incomplete-player-fill-queries.service';
import { InjuryFillStageService } from './generate-incomplete-player-fills/injury-fill-stage.service';
import { LastingInjuryProofService } from './generate-incomplete-player-fills/lasting-injury-proof.service';
import { LastingInjuryRepairQueriesService } from './generate-incomplete-player-fills/lasting-injury-repair-queries.service';
import { LookupQueriesService } from './generate-incomplete-player-fills/lookup-queries.service';
import { ManualBatchFillsStoreService } from './generate-incomplete-player-fills/manual-batch-fills-store.service';
import { PositionProfileService } from './generate-incomplete-player-fills/position-profile.service';
import { PositionRulesQueriesService } from './generate-incomplete-player-fills/position-rules-queries.service';
import { PricingRulesSetsService } from './generate-incomplete-player-fills/pricing-rules-sets.service';
import { ScratchCompletenessService } from './generate-incomplete-player-fills/scratch-completeness.service';
import { SnapshotFillStageService } from './generate-incomplete-player-fills/snapshot-fill-stage.service';
import { SnapshotOrderSearchService } from './generate-incomplete-player-fills/snapshot-order-search.service';
import { SnapshotSkillResolverService } from './generate-incomplete-player-fills/snapshot-skill-resolver.service';
import { LocalDatabaseModule } from './local-database/local-database.module';
import { LocalDatabaseShutdownService } from './local-database/local-database-shutdown.service';
import { LocalDatabaseUrlService } from './local-database/local-database-url.service';
import { ReadTpFeedHistoryService } from './read-tp-feed-history/read-tp-feed-history.service';
import { SnowflakeOrderService } from './read-tp-feed-history/snowflake-order.service';
import { TpFeedHistoryIndexService } from './read-tp-feed-history/tp-feed-history-index.service';
import { TpFeedHistoryStoreService } from './read-tp-feed-history/tp-feed-history-store.service';
import { ReadTpRosterSnapshotsService } from './read-tp-roster-snapshots/read-tp-roster-snapshots.service';
import { TpRosterCopyReaderService } from './read-tp-roster-snapshots/tp-roster-copy-reader.service';
import { TpRosterCopySelectionService } from './read-tp-roster-snapshots/tp-roster-copy-selection.service';
import { TpRosterSnapshotExtractorService } from './read-tp-roster-snapshots/tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './read-tp-roster-snapshots/tp-roster-snapshot-index.service';
import { TpRosterSnapshotsStoreService } from './read-tp-roster-snapshots/tp-roster-snapshots-store.service';

/** The one subcommand that reads the local database. */
export const LOCAL_DATABASE_SUBCOMMAND = 'generate-incomplete-player-fills';

/** The evidence collectors' services, which every run gets (the generator reads their stores). */
const EVIDENCE_PROVIDERS: Provider[] = [
  ReadTpFeedHistoryService,
  SnowflakeOrderService,
  TpFeedHistoryIndexService,
  TpFeedHistoryStoreService,
  ReadTpRosterSnapshotsService,
  TpRosterSnapshotExtractorService,
  TpRosterSnapshotIndexService,
  TpRosterSnapshotsStoreService,
  TpRosterCopyReaderService,
  TpRosterCopySelectionService,
];

/** generate-incomplete-player-fills' services, which need the database. */
const FILL_PROVIDERS: Provider[] = [
  CharacteristicValidityService,
  PricingRulesSetsService,
  SnapshotSkillResolverService,
  SnapshotOrderSearchService,
  SnapshotFillStageService,
  FeedOwnerFitService,
  FeedSplitSearchService,
  AdvancementFillStageService,
  InjuryFillStageService,
  CharacteristicChangeService,
  CharacteristicReplayService,
  LastingInjuryProofService,
  ManualBatchFillsStoreService,
  ScratchCompletenessService,
  FeedPlayerMatcherService,
  FeedSkillResolverService,
  FillSectionRendererService,
  GenerateIncompletePlayerFillsService,
  FillEntryBuilderService,
  IncompletePlayerFillPlannerService,
  IncompletePlayerFillQueriesService,
  PositionProfileService,
  FillQueryScopeService,
  FillRowShapesService,
  CandidateQueriesService,
  CandidateMatchQueriesService,
  PositionRulesQueriesService,
  EraRulesQueriesService,
  LookupQueriesService,
  LastingInjuryRepairQueriesService,
  LocalDatabaseShutdownService,
];

@Module({})
export class AppModule {
  /**
   * The module for one run of `subcommand`. DbModule connects and applies
   * pending migrations while the context starts, so only
   * generate-incomplete-player-fills gets it, and with it the services that
   * read it; the evidence collectors run with no database at all.
   */
  static register(subcommand: string | undefined): DynamicModule {
    const fills = subcommand === LOCAL_DATABASE_SUBCOMMAND;
    return {
      module: AppModule,
      imports: [
        CliSharedModule,
        DiscordRestModule,
        GameRulesModule,
        ParseTpModule,
        ParseTpFeedModule,
        ...(fills
          ? [
              LocalDatabaseModule,
              DbModule.forRootAsync({
                useFactory: (url: LocalDatabaseUrlService) => url.resolve(),
                inject: [LocalDatabaseUrlService],
              }),
            ]
          : []),
      ],
      providers: [...EVIDENCE_PROVIDERS, ...(fills ? FILL_PROVIDERS : [])],
    };
  }
}
