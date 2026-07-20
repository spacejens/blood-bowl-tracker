import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpTeamsImportService } from './tp-teams-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertTeam: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  upsertExternalSystem,
  upsertTeam,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpTeamsImportService(
    { files } as unknown as TpSourceReader,
    new RosterParserService(),
    { upsertTeam } as unknown as TeamsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

interface RosterOpts {
  id: number;
  teamName?: string;
  teamRace: string;
  raceName?: string;
  coachTpId: string;
}

function rosterFile(era: string, opts: RosterOpts): TpSourceFile {
  return {
    era,
    competition: 'comp',
    type: 'rosters',
    filename: `rosters_${opts.id}.json`,
    content: {
      id: opts.id,
      teamName: opts.teamName ?? `Team ${opts.id}`,
      teamRace: opts.teamRace,
      player: { applicationUserId: opts.coachTpId },
      rosterMaster: {
        name: opts.raceName ?? 'Orc',
        starPlayersMasters: [],
        lineUpMasters: [],
      },
    },
  };
}

function teamRecord(id: number) {
  return {
    id,
    name: 'X',
    raceId: 1,
    coachId: 1,
    eras: [],
    createdAt: new Date(),
    created: true,
  };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
}

describe('TpTeamsImportService', () => {
  it('upserts a team with resolved race, coach, eras and external ids', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      new Map([['Orc', 50]]),
      new Map([['guid-c', 900]]),
      new Map([['Fourth era', 100]]),
    );

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(upsertTeam).toHaveBeenCalledWith(
      {
        name: 'Da Boyz',
        raceId: 50,
        coachId: 900,
        eras: [100],
        externalIds: [
          { externalSystemId: 1, externalId: '5' },
          { externalSystemId: 2, externalId: 'Da Boyz' },
        ],
      },
      expect.any(Array),
    );
  });

  it('accumulates eras for one team seen under multiple eras', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterFile('Fifth era', {
          id: 5,
          teamRace: 'Orc_BB2025',
          coachTpId: 'guid-c',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      new Map([
        ['Orc', 50],
        ['Orc_BB2025', 50],
      ]),
      new Map([['guid-c', 900]]),
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect((upsertTeam.mock.calls[0][0] as UpsertTeam).eras).toEqual([
      100, 200,
    ]);
  });

  it('skips and records an error when the race cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      new Map(),
      new Map([['guid-c', 900]]),
      new Map([['Fourth era', 100]]),
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('skips and records an error when the coach cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      new Map([['Orc', 50]]),
      new Map(),
      new Map([['Fourth era', 100]]),
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ]),
      upsertExternalSystem: vi
        .fn()
        .mockRejectedValue(new Error('network timeout')),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      new Map([['Orc', 50]]),
      new Map([['guid-c', 900]]),
      new Map([['Fourth era', 100]]),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertTeam).not.toHaveBeenCalled();
  });
});
