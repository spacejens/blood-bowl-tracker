import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { REVIEW_PLAYER_CONFIG_PATH } from './config/review-player-config.service';
import { ReviewService } from './harness/review.service';

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
});
