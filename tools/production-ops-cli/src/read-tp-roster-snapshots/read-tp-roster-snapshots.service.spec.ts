import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ReadTpRosterSnapshotsService } from './read-tp-roster-snapshots.service';
import {
  TpRosterSnapshotExtractorService,
  type TpRosterSnapshotObservation,
} from './tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './tp-roster-snapshot-index.service';
import type { TpRosterSnapshots } from './tp-roster-snapshots.schema';
import {
  type TpRosterSnapshotSourceFile,
  TpRosterSnapshotsStoreService,
} from './tp-roster-snapshots-store.service';

const MATCH: TpRosterSnapshotSourceFile = {
  kind: 'match',
  source: 'e/match_1.json',
  path: '/d/e/match_1.json',
};
const ROSTER: TpRosterSnapshotSourceFile = {
  kind: 'roster',
  source: 'e/rosters_2.json',
  path: '/d/e/rosters_2.json',
};
const BROKEN: TpRosterSnapshotSourceFile = {
  kind: 'match',
  source: 'e/match_3.json',
  path: '/d/e/match_3.json',
};
const SEEN: TpRosterSnapshotObservation = {
  playerId: '5',
  source: 'e/match_1.json',
  state: {
    lineUpMasterId: 288,
    level: 0,
    skillMasterIds: [],
    totalSpp: 6,
    unspentSpp: 6,
  },
};
const VARIANT = { ...SEEN.state, sources: ['e/match_1.json'] };
const SNAPSHOTS: TpRosterSnapshots = {
  players: { '5': [VARIANT], '6': [VARIANT, { ...VARIANT, level: 1 }] },
  conflicts: ['6'],
  unreadable: [{ source: 'e/match_3.json', reason: 'bad' }],
};
const WRITTEN = {
  written: 'tools/production-ops-cli/data/tp-roster-snapshots/snapshots.json',
  bytes: 10,
};

describe('ReadTpRosterSnapshotsService', () => {
  let service: ReadTpRosterSnapshotsService;
  let store: MockProxy<TpRosterSnapshotsStoreService>;
  let extractor: MockProxy<TpRosterSnapshotExtractorService>;
  let index: MockProxy<TpRosterSnapshotIndexService>;

  beforeEach(async () => {
    store = mock<TpRosterSnapshotsStoreService>();
    extractor = mock<TpRosterSnapshotExtractorService>();
    index = mock<TpRosterSnapshotIndexService>();
    store.dataDir.mockResolvedValue('/d');
    store.listSources.mockResolvedValue([MATCH, ROSTER, BROKEN]);
    store.readSource.mockImplementation((file) =>
      file === BROKEN
        ? Promise.reject(new Error('/d/e/match_3.json is not valid JSON'))
        : Promise.resolve({ file: file.source }),
    );
    extractor.extract.mockImplementation((input) =>
      input.kind === 'match'
        ? { kind: 'observations', observations: [SEEN] }
        : { kind: 'unreadable', reason: 'lineUps: required' },
    );
    index.build.mockReturnValue(SNAPSHOTS);
    store.writeSnapshots.mockResolvedValue(WRITTEN);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadTpRosterSnapshotsService,
        { provide: TpRosterSnapshotsStoreService, useValue: store },
        { provide: TpRosterSnapshotExtractorService, useValue: extractor },
        { provide: TpRosterSnapshotIndexService, useValue: index },
      ],
    }).compile();
    service = moduleRef.get(ReadTpRosterSnapshotsService);
  });

  it('extracts every file it can read and indexes the rest as unreadable', async () => {
    await service.run();

    expect(extractor.extract).toHaveBeenCalledWith({
      kind: 'match',
      source: 'e/match_1.json',
      content: { file: 'e/match_1.json' },
    });
    expect(extractor.extract).toHaveBeenCalledWith({
      kind: 'roster',
      source: 'e/rosters_2.json',
      content: { file: 'e/rosters_2.json' },
    });
    expect(extractor.extract).toHaveBeenCalledTimes(2);
    expect(index.build).toHaveBeenCalledWith({
      observations: [SEEN],
      unreadable: [
        { source: 'e/rosters_2.json', reason: 'lineUps: required' },
        {
          source: 'e/match_3.json',
          reason: '/d/e/match_3.json is not valid JSON',
        },
      ],
    });
    expect(store.writeSnapshots).toHaveBeenCalledWith(SNAPSHOTS);
  });

  it('records a non-Error read failure by its text', async () => {
    store.readSource.mockRejectedValue('boom');
    await service.run();

    expect(index.build).toHaveBeenCalledWith({
      observations: [],
      unreadable: [
        { source: 'e/match_1.json', reason: 'boom' },
        { source: 'e/rosters_2.json', reason: 'boom' },
        { source: 'e/match_3.json', reason: 'boom' },
      ],
    });
  });

  it('summarises the files read, the players found and the conflicts', async () => {
    await expect(service.run()).resolves.toEqual({
      dataDir: '/d',
      written: WRITTEN,
      matchFiles: 2,
      rosterFiles: 1,
      unreadable: 1,
      players: 2,
      conflicts: 1,
    });
  });
});
