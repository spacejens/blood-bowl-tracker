import {
  DEFAULT_LOCAL_DATABASE_URL,
  DiscordRestService,
  GitRootsService,
  LocalDatabaseGuardService,
  PgClientService,
  ProcessRunnerService,
  ProductionEnvFileService,
  WriteFileService,
} from '@blood-bowl-tracker/cli-shared';
import { DATABASE_URL, DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { TpFeedAdvancementParserService } from '@blood-bowl-tracker/parse-tp-feed';
import { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { AdvancementFillStageService } from './generate-incomplete-player-fills/advancement-fill-stage.service';
import { AdvancementPricingService } from './generate-incomplete-player-fills/advancement-pricing.service';
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
import { LastingInjuryRepairSelectorService } from './generate-incomplete-player-fills/lasting-injury-repair-selector.service';
import { LookupQueriesService } from './generate-incomplete-player-fills/lookup-queries.service';
import { ManualBatchFillsStoreService } from './generate-incomplete-player-fills/manual-batch-fills-store.service';
import { PositionProfileService } from './generate-incomplete-player-fills/position-profile.service';
import { PositionRulesQueriesService } from './generate-incomplete-player-fills/position-rules-queries.service';
import { PricingRulesSetsService } from './generate-incomplete-player-fills/pricing-rules-sets.service';
import { ScratchCompletenessService } from './generate-incomplete-player-fills/scratch-completeness.service';
import { SnapshotFillStageService } from './generate-incomplete-player-fills/snapshot-fill-stage.service';
import { SnapshotOrderSearchService } from './generate-incomplete-player-fills/snapshot-order-search.service';
import { SnapshotSkillResolverService } from './generate-incomplete-player-fills/snapshot-skill-resolver.service';
import { LocalDatabaseShutdownService } from './local-database/local-database-shutdown.service';
import {
  LOCAL_DATABASE_ENV,
  LocalDatabaseUrlService,
} from './local-database/local-database-url.service';
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

/** The services every run gets. */
const EVIDENCE_SERVICES: readonly Type<unknown>[] = [
  ProcessRunnerService,
  GitRootsService,
  ProductionEnvFileService,
  PgClientService,
  WriteFileService,
  DiscordRestService,
  TpFeedAdvancementParserService,
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

/** The services only generate-incomplete-player-fills gets, with the local database. */
const FILL_SERVICES: readonly Type<unknown>[] = [
  CharacteristicValidityService,
  AdvancementPricingService,
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
  LastingInjuryRepairSelectorService,
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
  CandidateMatchQueriesService,
  CandidateQueriesService,
  EraRulesQueriesService,
  FillQueryScopeService,
  FillRowShapesService,
  LastingInjuryRepairQueriesService,
  LookupQueriesService,
  PositionRulesQueriesService,
  LocalDatabaseGuardService,
  LocalDatabaseUrlService,
  LocalDatabaseShutdownService,
];

describe('AppModule', () => {
  it('wires every generate-incomplete-player-fills service against the guarded local database', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register('generate-incomplete-player-fills')],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .overrideProvider(LOCAL_DATABASE_ENV)
      .useValue({})
      .compile();

    for (const service of [...EVIDENCE_SERVICES, ...FILL_SERVICES]) {
      expect(moduleRef.get(service)).toBeInstanceOf(service);
    }
    expect(moduleRef.get(DATABASE_URL)).toBe(
      `${DEFAULT_LOCAL_DATABASE_URL}?client_min_messages=warning`,
    );
  });

  it.each(['read-tp-feed-history', 'read-tp-roster-snapshots'])(
    'wires %s with no database',
    async (subcommand) => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule.register(subcommand)],
      }).compile();

      for (const service of EVIDENCE_SERVICES) {
        expect(moduleRef.get(service)).toBeInstanceOf(service);
      }
      expect(() => {
        moduleRef.get(DB);
      }).toThrow();
      expect(() => {
        moduleRef.get(GenerateIncompletePlayerFillsService);
      }).toThrow();
    },
  );
});
