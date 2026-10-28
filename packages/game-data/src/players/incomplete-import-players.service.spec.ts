import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  eras,
  players,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { QueryChain, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import type { IncompleteImportTeamRow } from './incomplete-import-players.service';
import { IncompleteImportPlayersService } from './incomplete-import-players.service';

function row(
  overrides: Partial<IncompleteImportTeamRow> = {},
): IncompleteImportTeamRow {
  return {
    teamEraId: 1,
    teamId: 10,
    teamName: 'Orc Raiders',
    coachId: 100,
    coachName: 'Skarsnik',
    raceName: 'Orc',
    eraName: 'Season 3',
    incompletePlayerCount: 3,
    ...overrides,
  };
}

describe('IncompleteImportPlayersService', () => {
  let service: IncompleteImportPlayersService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompleteImportPlayersService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(IncompleteImportPlayersService);
    return { db, chains };
  }

  it('returns the query rows unchanged', async () => {
    const rows = [row(), row({ teamEraId: 2, incompletePlayerCount: 1 })];
    await build(rows);

    await expect(service.findTeamsWithIncompletePlayers()).resolves.toEqual(
      rows,
    );
  });

  it('returns an empty list when no team has incomplete players', async () => {
    await build([]);

    await expect(service.findTeamsWithIncompletePlayers()).resolves.toEqual([]);
  });

  it('issues a single query from players', async () => {
    const { db, chains } = await build([]);

    await service.findTeamsWithIncompletePlayers();

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(chains[0].from).toHaveBeenCalledWith(players);
  });

  it('joins team eras, teams, coaches, races, eras and positions', async () => {
    const { chains } = await build([]);

    await service.findTeamsWithIncompletePlayers();

    const joins = chains[0].innerJoin.mock.calls.map((_, index) =>
      extractJoinColumns(firstCallArg(chains[0].innerJoin, index, 1)),
    );
    expect(joins).toEqual([
      ['team_eras.id', 'players.team_era_id'],
      ['teams.id', 'team_eras.team_id'],
      ['coaches.id', 'teams.coach_id'],
      ['races.id', 'teams.race_id'],
      ['eras.id', 'team_eras.era_id'],
      ['positions.id', 'players.position_id'],
    ]);
  });

  it('excludes star players and filters on every incomplete-data criterion, never on passing', async () => {
    const { chains } = await build([]);

    await service.findTeamsWithIncompletePlayers();

    const condition = firstCallArg(chains[0].where);
    expect(extractJoinColumns(condition)).toEqual([
      'positions.is_star_player',
      'players.move',
      'players.strength',
      'players.agility',
      'players.armour',
      'players.spp_total',
      'players.spp_adjustment',
      'players.status',
    ]);
    expect(extractAllFilterValues(condition)).toEqual([false, 0, 0, 0, 0]);
  });

  it('keeps regular players that match any criterion and drops star players', async () => {
    const { chains } = await build([]);

    await service.findTeamsWithIncompletePlayers();

    const query = new PgDialect().sqlToQuery(
      firstCallArg(chains[0].where) as SQL,
    );
    expect(query.sql).toBe(
      '(("game_data"."positions"."is_star_player" = $1) and ((' +
        '("game_data"."players"."move" = $2) ' +
        'or ("game_data"."players"."strength" = $3) ' +
        'or ("game_data"."players"."agility" = $4) ' +
        'or ("game_data"."players"."armour" = $5) ' +
        'or (("game_data"."players"."spp_total" is null)) ' +
        'or (("game_data"."players"."spp_adjustment" is null)) ' +
        'or (("game_data"."players"."status" is null)))))',
    );
    expect(query.params).toEqual([false, 0, 0, 0, 0]);
  });

  it('groups by team era', async () => {
    const { chains } = await build([]);

    await service.findTeamsWithIncompletePlayers();

    expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
    expect(chains[0].groupBy.mock.calls[0]).toEqual([
      teamEras.id,
      teams.id,
      teams.name,
      coaches.id,
      coaches.name,
      races.name,
      eras.name,
    ]);
  });
});
