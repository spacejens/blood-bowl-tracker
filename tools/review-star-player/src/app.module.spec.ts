import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { REVIEW_STAR_PLAYER_CONFIG_PATH } from './config/review-star-player-config.service';
import { ReviewService } from './harness/review.service';
import type { StarPlayerDataTypeReviewer } from './shared/data-type-reviewer';
import { STAR_PLAYER_DATA_TYPE_REVIEWERS } from './shared/data-type-reviewer';
import type { StarPlayerStratifier } from './shared/star-player-stratifier';
import { STAR_PLAYER_STRATIFIERS } from './shared/star-player-stratifier';
import { CharacteristicsChangeStratificationService } from './star-player-characteristics/characteristics-change-stratification.service';
import { MissingRulesSetStratificationService } from './star-player-characteristics/missing-rules-set-stratification.service';
import { EligibilityMismatchStratificationService } from './star-player-hire-eligibility/eligibility-mismatch-stratification.service';
import { MercenaryVsEmbeddedStratificationService } from './star-player-hire-eligibility/mercenary-vs-embedded-stratification.service';
import { RandomStarPlayerStratificationService } from './star-player-identity/random-star-player-stratification.service';
import { SourceCoverageStratificationService } from './star-player-identity/source-coverage-stratification.service';
import { StarPlayerKeywordsStratificationService } from './star-player-keywords/star-player-keywords-stratification.service';
import { StarPlayerSkillsStratificationService } from './star-player-skills/star-player-skills-stratification.service';

describe('AppModule', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'app-module-review-star-player-'));
    configPath = join(dir, 'review-star-player-config.json5');
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
      .overrideProvider(REVIEW_STAR_PLAYER_CONFIG_PATH)
      .useValue(configPath)
      // The real DB provider would connect to Postgres and run migrations;
      // this test is about the graph, not the database.
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(ReviewService)).toBeInstanceOf(ReviewService);
  });

  it('registers all eight star player stratifiers in STAR_PLAYER_STRATIFIERS', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_STAR_PLAYER_CONFIG_PATH)
      .useValue(configPath)
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    const stratifiers = moduleRef.get<StarPlayerStratifier[]>(
      STAR_PLAYER_STRATIFIERS,
    );
    expect(stratifiers).toHaveLength(8);
    expect(
      [
        CharacteristicsChangeStratificationService,
        MissingRulesSetStratificationService,
        StarPlayerSkillsStratificationService,
        StarPlayerKeywordsStratificationService,
        SourceCoverageStratificationService,
        EligibilityMismatchStratificationService,
        MercenaryVsEmbeddedStratificationService,
        RandomStarPlayerStratificationService,
      ].every((serviceClass) =>
        stratifiers.some((stratifier) => stratifier instanceof serviceClass),
      ),
    ).toBe(true);
  });

  it('registers the five star player data type reviewers in report order', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    })
      .overrideProvider(REVIEW_STAR_PLAYER_CONFIG_PATH)
      .useValue(configPath)
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    const reviewers = moduleRef.get<StarPlayerDataTypeReviewer[]>(
      STAR_PLAYER_DATA_TYPE_REVIEWERS,
    );
    expect(reviewers).toHaveLength(5);
    expect(reviewers.map((reviewer) => reviewer.id)).toEqual([
      'star-player-identity',
      'star-player-characteristics',
      'star-player-skills',
      'star-player-keywords',
      'star-player-hire-eligibility',
    ]);
  });
});
