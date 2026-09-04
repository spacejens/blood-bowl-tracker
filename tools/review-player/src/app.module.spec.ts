import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { REVIEW_PLAYER_CONFIG_PATH } from './config/review-player-config.service';
import { ReviewService } from './harness/review.service';
import { CharacteristicsChangeStratificationService } from './player-characteristics/characteristics-change-stratification.service';
import { RandomPlayerStratificationService } from './player-info/random-player-stratification.service';
import { StarPlayerStratificationService } from './player-info/star-player-stratification.service';
import type { PlayerStratifier } from './shared/player-stratifier';
import { PLAYER_STRATIFIERS } from './shared/player-stratifier';
import { SppDiscrepancyStratificationService } from './spp-totals/spp-discrepancy-stratification.service';
import { SppMagnitudeStratificationService } from './spp-totals/spp-magnitude-stratification.service';
import { SppNonStandardContributionStratificationService } from './spp-totals/spp-non-standard-contribution-stratification.service';

describe('AppModule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-review-player-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers ReviewService with its whole dependency graph wired', async () => {
    const configPath = join(dir, 'review-player-config.json5');
    writeFileSync(
      configPath,
      "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_PLAYER_CONFIG_PATH)
      .useValue(configPath)
      // The real DB provider would connect to Postgres and run migrations;
      // this test is about the graph, not the database.
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(ReviewService)).toBeInstanceOf(ReviewService);
  });

  it('registers all six player stratifiers in PLAYER_STRATIFIERS', async () => {
    const configPath = join(dir, 'review-player-config.json5');
    writeFileSync(
      configPath,
      "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_PLAYER_CONFIG_PATH)
      .useValue(configPath)
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    const stratifiers = moduleRef.get<PlayerStratifier[]>(PLAYER_STRATIFIERS);
    expect(stratifiers).toHaveLength(6);
    expect(
      [
        RandomPlayerStratificationService,
        StarPlayerStratificationService,
        SppDiscrepancyStratificationService,
        SppMagnitudeStratificationService,
        SppNonStandardContributionStratificationService,
        CharacteristicsChangeStratificationService,
      ].every((serviceClass) =>
        stratifiers.some((stratifier) => stratifier instanceof serviceClass),
      ),
    ).toBe(true);
  });
});
