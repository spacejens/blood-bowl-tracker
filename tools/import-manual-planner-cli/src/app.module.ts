import {
  CliSharedModule,
  DiscordRestModule,
  ProductionQueryModule,
} from '@blood-bowl-tracker/cli-shared';
import { GameRulesModule } from '@blood-bowl-tracker/game-rules';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { ParseTpFeedModule } from '@blood-bowl-tracker/parse-tp-feed';
import { ReadTpFilesModule } from '@blood-bowl-tracker/read-tp-files';
import { Module } from '@nestjs/common';

import { AdvancementFillStageService } from './generate-incomplete-player-fills/advancement-fill-stage.service';
import { CharacteristicChangeService } from './generate-incomplete-player-fills/characteristic-change.service';
import { CharacteristicReplayService } from './generate-incomplete-player-fills/characteristic-replay.service';
import { CharacteristicValidityService } from './generate-incomplete-player-fills/characteristic-validity.service';
import { FeedOwnerFitService } from './generate-incomplete-player-fills/feed-owner-fit.service';
import { FeedPlayerMatcherService } from './generate-incomplete-player-fills/feed-player-matcher.service';
import { FeedSkillResolverService } from './generate-incomplete-player-fills/feed-skill-resolver.service';
import { FeedSplitSearchService } from './generate-incomplete-player-fills/feed-split-search.service';
import { FillEntryBuilderService } from './generate-incomplete-player-fills/fill-entry-builder.service';
import { FillSectionRendererService } from './generate-incomplete-player-fills/fill-section-renderer.service';
import { GenerateIncompletePlayerFillsService } from './generate-incomplete-player-fills/generate-incomplete-player-fills.service';
import { IncompletePlayerFillPlannerService } from './generate-incomplete-player-fills/incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './generate-incomplete-player-fills/incomplete-player-fill-queries.service';
import { InjuryFillStageService } from './generate-incomplete-player-fills/injury-fill-stage.service';
import { LastingInjuryProofService } from './generate-incomplete-player-fills/lasting-injury-proof.service';
import { ManualBatchFillsStoreService } from './generate-incomplete-player-fills/manual-batch-fills-store.service';
import { PositionProfileService } from './generate-incomplete-player-fills/position-profile.service';
import { PricingRulesSetsService } from './generate-incomplete-player-fills/pricing-rules-sets.service';
import { ProductionJsonQueryService } from './generate-incomplete-player-fills/production-json-query.service';
import { ScratchCompletenessService } from './generate-incomplete-player-fills/scratch-completeness.service';
import { SnapshotFillStageService } from './generate-incomplete-player-fills/snapshot-fill-stage.service';
import { SnapshotOrderSearchService } from './generate-incomplete-player-fills/snapshot-order-search.service';
import { SnapshotSkillResolverService } from './generate-incomplete-player-fills/snapshot-skill-resolver.service';
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

@Module({
  imports: [
    CliSharedModule,
    DiscordRestModule,
    GameRulesModule,
    ProductionQueryModule,
    ParseTpModule,
    ParseTpFeedModule,
    ReadTpFilesModule,
  ],
  providers: [
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
    ProductionJsonQueryService,
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
  ],
})
export class AppModule {}
