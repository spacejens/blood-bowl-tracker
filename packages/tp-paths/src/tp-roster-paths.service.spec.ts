import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRosterPathsService } from './tp-roster-paths.service';

describe('TpRosterPathsService', () => {
  let paths: TpRosterPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterPathsService],
    }).compile();
    paths = moduleRef.get(TpRosterPathsService);
  });

  it("builds a roster's API path", () => {
    expect(paths.apiPath(163386)).toBe('rosters/163386');
    expect(paths.apiPath('r7')).toBe('rosters/r7');
  });

  it("builds a roster's frontend page path", () => {
    expect(paths.frontendPath(163386)).toBe('roster/163386');
  });
});
