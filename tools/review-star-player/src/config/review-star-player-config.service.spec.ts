import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REVIEW_STAR_PLAYER_CONFIG_PATH,
  StarPlayerReviewConfigService,
} from './review-star-player-config.service';

describe('StarPlayerReviewConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-star-player-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    contents: string,
  ): Promise<StarPlayerReviewConfigService> {
    const path = join(dir, 'review-star-player-config.json5');
    writeFileSync(path, contents, 'utf8');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerReviewConfigService,
        { provide: REVIEW_STAR_PLAYER_CONFIG_PATH, useValue: path },
      ],
    }).compile();
    return moduleRef.get(StarPlayerReviewConfigService);
  }

  it('reads the database url', async () => {
    const service = await makeService(
      "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
    );

    expect(service.getDatabaseUrl()).toBe('postgres://u:p@localhost:5433/db');
  });

  it('returns the configured stars per stratum', async () => {
    const service = await makeService('{ starsPerStratum: 7 }');

    expect(service.getStarsPerStratum()).toBe(7);
  });

  it('defaults stars per stratum to 3 when unset', async () => {
    const service = await makeService('{}');

    expect(service.getStarsPerStratum()).toBe(3);
  });

  it('rejects a non-positive-integer stars per stratum', async () => {
    const service = await makeService('{ starsPerStratum: 0 }');

    expect(() => service.getStarsPerStratum()).toThrow(
      /starsPerStratum in review-star-player-config\.json5/,
    );
  });

  it("names this tool's config file when the database url is missing", async () => {
    const service = await makeService('{}');

    expect(() => service.getDatabaseUrl()).toThrow(
      /review-star-player-config\.json5/,
    );
  });
});
