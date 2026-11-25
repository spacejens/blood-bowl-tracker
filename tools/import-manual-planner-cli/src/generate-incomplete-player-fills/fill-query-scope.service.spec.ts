import { eraRulesSets, positionRulesSets } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TeamPlayerRow } from './fill-plan.types';
import { renderSql } from './fill-query.test-helpers';
import type { CandidateScopeRow } from './fill-query.types';
import { FillQueryScopeService } from './fill-query-scope.service';

const candidate = (
  overrides: Partial<CandidateScopeRow>,
): CandidateScopeRow => ({
  playerId: 1,
  tpId: '500',
  teamId: 20,
  teamEraId: 21,
  positionId: 30,
  eraId: 4,
  sppTotal: 5,
  unspentSpp: null,
  status: null,
  isJourneyman: false,
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
  ...overrides,
});

const teamPlayer = (overrides: Partial<TeamPlayerRow>): TeamPlayerRow => ({
  playerId: 1,
  teamId: 20,
  eraId: 4,
  positionId: 30,
  playerName: 'Flame',
  positionName: 'Gnoblar Lineman',
  sppTotal: 20,
  unspentSpp: null,
  isJourneyman: false,
  isIncomplete: true,
  ...overrides,
});

describe('FillQueryScopeService', () => {
  let service: FillQueryScopeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FillQueryScopeService],
    }).compile();
    service = moduleRef.get(FillQueryScopeService);
  });

  it('scopes the candidates, dropping the team era from the planner rows', () => {
    const scope = service.candidateScope([
      candidate({}),
      candidate({ playerId: 2, tpId: '501', teamEraId: 22, positionId: 31 }),
      candidate({ playerId: 3, tpId: '502', teamId: 25, teamEraId: 26 }),
    ]);
    expect(scope.rows[0]).not.toHaveProperty('teamEraId');
    expect(scope.rows.map((row) => row.playerId)).toEqual([1, 2, 3]);
    expect(scope.playerIds).toEqual([1, 2, 3]);
    expect(scope.teamIds).toEqual([20, 25]);
    expect(scope.positionIds).toEqual([30, 31]);
    expect(scope.positionEras).toEqual([
      { positionId: 30, eraId: 4 },
      { positionId: 31, eraId: 4 },
    ]);
    expect(scope.playerTeamEras).toEqual([
      { playerId: 1, teamEraId: 21 },
      { playerId: 2, teamEraId: 22 },
      { playerId: 3, teamEraId: 26 },
    ]);
  });

  it('scopes the team players by player, era and position in era', () => {
    expect(
      service.teamPlayerScope([
        teamPlayer({}),
        teamPlayer({ playerId: 2, eraId: 5 }),
        teamPlayer({ playerId: 3 }),
      ]),
    ).toEqual({
      playerIds: [1, 2, 3],
      eraIds: [4, 5],
      positionEras: [
        { positionId: 30, eraId: 4 },
        { positionId: 30, eraId: 5 },
      ],
    });
  });

  it('filters by (position, era) pairs', () => {
    const rendered = renderSql(
      service.positionEraIn(
        { position: positionRulesSets.positionId, era: eraRulesSets.eraId },
        [
          { positionId: 30, eraId: 4 },
          { positionId: 31, eraId: 5 },
        ],
      ),
    );
    expect(rendered.sql).toMatch(
      /\("[a-z_".]*position_id", "[a-z_".]*era_id"\) in \(\(\$1, \$2\), \(\$3, \$4\)\)/,
    );
    expect(rendered.params).toEqual([30, 4, 31, 5]);
  });

  it('matches nothing with no pairs', () => {
    const rendered = renderSql(
      service.positionEraIn(
        { position: positionRulesSets.positionId, era: eraRulesSets.eraId },
        [],
      ),
    );
    expect(rendered).toEqual({ sql: 'false', params: [] });
  });

  it('finds an external system id by name in a scalar subquery', () => {
    const rendered = renderSql(service.externalSystemId('Name'));
    expect(rendered.sql).toMatch(
      /^\(select .*"id" from .*"external_systems" where .*"name" = \$1\)$/,
    );
    expect(rendered.params).toEqual(['Name']);
  });
});
