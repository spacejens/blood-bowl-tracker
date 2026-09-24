import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpOfficialTeamsPathsService } from './tp-official-teams-paths.service';

describe('TpOfficialTeamsPathsService', () => {
  let paths: TpOfficialTeamsPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialTeamsPathsService],
    }).compile();
    paths = moduleRef.get(TpOfficialTeamsPathsService);
  });

  it("builds one rules set's official team list API path", () => {
    expect(paths.apiPath(25)).toBe('rosters/masters?ruleSet=25');
  });

  it('builds the teams page path', () => {
    expect(paths.frontendPath()).toBe('teams');
  });

  it("maps a rules set name to TP's ruleSet id, case-insensitively", () => {
    expect(paths.ruleSetIdFor('BB2020')).toBe(20);
    expect(paths.ruleSetIdFor('db2021')).toBe(21);
    expect(paths.ruleSetIdFor('Bb2025')).toBe(25);
  });

  it('answers undefined for a rules set TP has no id for', () => {
    expect(paths.ruleSetIdFor('BB2016')).toBeUndefined();
  });

  it('lists every known rules set by its canonical name', () => {
    expect(paths.knownRulesSets()).toEqual(['BB2020', 'DB2021', 'BB2025']);
  });
});
