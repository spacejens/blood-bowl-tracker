import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchPathsService } from './tp-match-paths.service';

describe('TpMatchPathsService', () => {
  let paths: TpMatchPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchPathsService],
    }).compile();
    paths = moduleRef.get(TpMatchPathsService);
  });

  it("builds a match's API path", () => {
    expect(paths.apiPath(576264)).toBe('match/576264');
    expect(paths.apiPath('576264')).toBe('match/576264');
  });

  it("builds a match's page path under its tournament", () => {
    expect(paths.frontendPath('s30', 576264)).toBe('s30/match/576264');
  });
});
