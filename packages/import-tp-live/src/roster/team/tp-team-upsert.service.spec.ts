import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  CoachesService,
  RacesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import {
  ERA_ID,
  NAME_SYSTEM_ID,
  rosterContext,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import { TpTeamUpsertService } from './tp-team-upsert.service';

type TeamUpsertResult = Awaited<ReturnType<TeamsService['upsert']>>;
type CoachUpsertResult = Awaited<ReturnType<CoachesService['upsert']>>;

describe('TpTeamUpsertService', () => {
  let service: TpTeamUpsertService;
  let races: MockProxy<RacesService>;
  let coaches: MockProxy<CoachesService>;
  let teams: MockProxy<TeamsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    races = mock<RacesService>();
    coaches = mock<CoachesService>();
    teams = mock<TeamsService>();
    errors = [];
    races.resolve.mockResolvedValue({ found: true, id: 7 });
    coaches.upsert.mockResolvedValue({
      coach: mock<CoachUpsertResult['coach']>({ id: 8 }),
      created: true,
    });
    // The eras array is assigned after mock() runs, not passed into its
    // initial partial: vitest-mock-extended recursively proxies every
    // nested object present at construction time (array elements included),
    // and later reading an unset property off such a proxy (as vitest's own
    // deep-equal does, e.g. via Symbol.toStringTag) silently mutates it with
    // a mock function — which then breaks a plain toEqual on these rows.
    // Assigning afterwards goes through the proxy's plain `set` trap instead.
    const team = mock<TeamUpsertResult['team']>({ id: 3 });
    team.eras = [
      { id: 30, eraId: 39 },
      { id: 31, eraId: ERA_ID },
    ];
    teams.upsert.mockResolvedValue({ team, created: true });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpTeamUpsertService,
        TpImportResultsService,
        TpUpsertRunnerService,
        TpNameExternalIdService,
        { provide: RacesService, useValue: races },
        { provide: CoachesService, useValue: coaches },
        { provide: TeamsService, useValue: teams },
      ],
    }).compile();
    service = moduleRef.get(TpTeamUpsertService);
  });

  const upsert = (rosterOverrides: Partial<TpRoster> = {}) =>
    service.upsertTeam({
      roster: tpRoster(rosterOverrides),
      context: rosterContext(),
      errors,
    });

  it('upserts the team with resolved race, coach, its era and external ids', async () => {
    await upsert();

    expect(teams.upsert).toHaveBeenCalledWith({
      name: 'Da Boyz',
      raceId: 7,
      coachId: 8,
      eras: [ERA_ID],
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: '163386' },
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Da Boyz' },
      ],
    });
  });

  it('resolves the race by team race code', async () => {
    await upsert();

    expect(races.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'orc',
    });
  });

  it("upserts the roster's coach by TP coach id and name", async () => {
    await upsert();

    expect(coaches.upsert).toHaveBeenCalledWith({
      name: 'Grimgor',
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: 'c-42' },
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Grimgor' },
      ],
    });
    expect(coaches.resolve).not.toHaveBeenCalled();
  });

  it("returns every team era the team now has, not only this call's", async () => {
    await expect(upsert()).resolves.toEqual([
      { id: 30, eraId: 39 },
      { id: 31, eraId: ERA_ID },
    ]);
    expect(errors).toEqual([]);
  });

  it('skips and records an error when the race cannot be resolved', async () => {
    races.resolve.mockResolvedValue({ found: false });

    await expect(upsert()).resolves.toBeUndefined();
    expect(teams.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { team: 163386, teamRaceCode: 'orc' },
        message:
          'Failed to import team "Da Boyz": could not resolve race for code "orc"',
      },
    ]);
  });

  it('creates a coach not previously known and imports the team under it', async () => {
    coaches.upsert.mockResolvedValue({
      coach: mock<CoachUpsertResult['coach']>({ id: 99 }),
      created: true,
    });

    await expect(upsert()).resolves.toBeDefined();
    expect(teams.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ coachId: 99 }),
    );
    expect(errors).toEqual([]);
  });

  it("refreshes an already-known coach's name from the roster and imports the team", async () => {
    coaches.upsert.mockResolvedValue({
      coach: mock<CoachUpsertResult['coach']>({ id: 8 }),
      created: false,
    });

    await upsert();

    expect(coaches.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grimgor' }),
    );
    expect(teams.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ coachId: 8 }),
    );
    expect(errors).toEqual([]);
  });

  it('omits the name and Name external id when the coach display name is blank', async () => {
    await upsert({ coachName: '' });

    expect(coaches.upsert).toHaveBeenCalledWith({
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'c-42' }],
    });
    expect(teams.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ coachId: 8 }),
    );
    expect(errors).toEqual([]);
  });

  it('skips the team and records an error when the coach upsert fails', async () => {
    coaches.upsert.mockRejectedValue(new Error('coach conflict'));

    await expect(upsert()).resolves.toBeUndefined();
    expect(teams.upsert).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { team: 163386, coachTpId: 'c-42', coachName: 'Grimgor' },
        message:
          'Failed to import team "Da Boyz": could not import coach "Grimgor": coach conflict',
      },
    ]);
  });

  it('records the upsert failure naming the team', async () => {
    teams.upsert.mockRejectedValue(new Error('conflict'));

    await expect(upsert()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Failed to import team "Da Boyz": conflict');
  });
});
