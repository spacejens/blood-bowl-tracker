import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RaceReviewConfigService,
  REVIEW_RACE_CONFIG_PATH,
} from './review-race-config.service';

describe('RaceReviewConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-race-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    contents: string,
  ): Promise<RaceReviewConfigService> {
    const path = join(dir, 'review-race-config.json5');
    writeFileSync(path, contents, 'utf8');
    const moduleRef = await Test.createTestingModule({
      providers: [
        RaceReviewConfigService,
        { provide: REVIEW_RACE_CONFIG_PATH, useValue: path },
      ],
    }).compile();
    return moduleRef.get(RaceReviewConfigService);
  }

  it('defaults racesPerStratum to 3', async () => {
    const service = await makeService('{}');

    expect(service.getRacesPerStratum()).toBe(3);
  });

  it('returns the configured racesPerStratum', async () => {
    const service = await makeService('{ racesPerStratum: 5 }');

    expect(service.getRacesPerStratum()).toBe(5);
  });

  it('rejects a non-positive racesPerStratum, naming the config file', async () => {
    const service = await makeService('{ racesPerStratum: 0 }');

    expect(() => service.getRacesPerStratum()).toThrow(
      /racesPerStratum in review-race-config\.json5/,
    );
  });

  it('resolves the manual data directory', async () => {
    const service = await makeService("{ manual: { dataDir: '/tmp/manual' } }");

    expect(service.getDataDir('manual')).toBe('/tmp/manual');
  });

  it('reads manual overrides as race names', async () => {
    const service = await makeService(
      "{ overrides: { manual: ['Dark Elf Team'] } }",
    );

    expect(service.getOverrides('manual')).toEqual(['Dark Elf Team']);
  });
});
