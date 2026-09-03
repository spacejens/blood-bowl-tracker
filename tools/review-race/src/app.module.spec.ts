import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { REVIEW_RACE_CONFIG_PATH } from './config/review-race-config.service';
import { ReviewService } from './harness/review.service';
import { CharacteristicsChangeStratificationService } from './position-characteristics/characteristics-change-stratification.service';
import { EraAvailabilityStratificationService } from './race-identity/era-availability-stratification.service';
import { NameMismatchStratificationService } from './race-identity/name-mismatch-stratification.service';
import { RandomRaceStratificationService } from './race-identity/random-race-stratification.service';
import { SourceCoverageStratificationService } from './race-identity/source-coverage-stratification.service';
import type { RaceDataTypeReviewer } from './shared/data-type-reviewer';
import { RACE_DATA_TYPE_REVIEWERS } from './shared/data-type-reviewer';
import type { RaceStratifier } from './shared/race-stratifier';
import { RACE_STRATIFIERS } from './shared/race-stratifier';

describe('AppModule', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-review-race-'));
    configPath = join(dir, 'review-race-config.json5');
    writeFileSync(
      configPath,
      "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers ReviewService with its whole dependency graph wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_RACE_CONFIG_PATH)
      .useValue(configPath)
      // The real DB provider would connect to Postgres and run migrations;
      // this test is about the graph, not the database.
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(ReviewService)).toBeInstanceOf(ReviewService);
  });

  it('registers all five race stratifiers in RACE_STRATIFIERS', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_RACE_CONFIG_PATH)
      .useValue(configPath)
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    const stratifiers = moduleRef.get<RaceStratifier[]>(RACE_STRATIFIERS);
    expect(stratifiers).toHaveLength(5);
    expect(
      [
        EraAvailabilityStratificationService,
        CharacteristicsChangeStratificationService,
        SourceCoverageStratificationService,
        NameMismatchStratificationService,
        RandomRaceStratificationService,
      ].every((serviceClass) =>
        stratifiers.some((stratifier) => stratifier instanceof serviceClass),
      ),
    ).toBe(true);
  });

  it('registers the three race data type reviewers in report order', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_RACE_CONFIG_PATH)
      .useValue(configPath)
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    const reviewers = moduleRef.get<RaceDataTypeReviewer[]>(
      RACE_DATA_TYPE_REVIEWERS,
    );
    expect(reviewers).toHaveLength(3);
    expect(reviewers.map((reviewer) => reviewer.id)).toEqual([
      'race-identity',
      'position-availability',
      'position-characteristics',
    ]);
  });
});
