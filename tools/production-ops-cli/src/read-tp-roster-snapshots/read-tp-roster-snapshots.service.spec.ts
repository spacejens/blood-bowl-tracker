import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ReadTpRosterSnapshotsService } from './read-tp-roster-snapshots.service';
import {
  type TpRosterCopy,
  TpRosterCopyReaderService,
} from './tp-roster-copy-reader.service';
import { TpRosterCopySelectionService } from './tp-roster-copy-selection.service';
import {
  TpRosterSnapshotExtractorService,
  type TpRosterSnapshotObservation,
} from './tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './tp-roster-snapshot-index.service';
import type {
  TpRosterCopyGroup,
  TpRosterPlayerSnapshots,
} from './tp-roster-snapshots.schema';
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
const SNAPSHOTS: TpRosterPlayerSnapshots = {
  players: { '5': [VARIANT], '6': [VARIANT, { ...VARIANT, level: 1 }] },
  conflicts: ['6'],
  unreadable: [{ source: 'e/match_3.json', reason: 'bad' }],
};
const COPY: TpRosterCopy = {
  era: 'e',
  rosterId: '2',
  source: 'e/rosters_2.json',
  finishedAt: 5,
  playerIds: ['5'],
};
const GROUPS: TpRosterCopyGroup[] = [
  {
    era: 'e',
    rosterId: '2',
    chosen: ['e/rosters_2.json'],
    listed: ['5'],
    listedElsewhere: [],
  },
  { era: 'e', rosterId: '4', chosen: [], listed: [], listedElsewhere: [] },
];
const BROKEN_ROSTER: TpRosterSnapshotSourceFile = {
  kind: 'roster',
  source: 'e/rosters_4.json',
  path: '/d/e/rosters_4.json',
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
  let copyReader: MockProxy<TpRosterCopyReaderService>;
  let selection: MockProxy<TpRosterCopySelectionService>;

  beforeEach(async () => {
    store = mock<TpRosterSnapshotsStoreService>();
    extractor = mock<TpRosterSnapshotExtractorService>();
    index = mock<TpRosterSnapshotIndexService>();
    copyReader = mock<TpRosterCopyReaderService>();
    selection = mock<TpRosterCopySelectionService>();
    copyReader.read.mockReturnValue({ kind: 'copy', copy: COPY });
    copyReader.locate.mockReturnValue({ era: 'e', rosterId: '4' });
    selection.select.mockReturnValue(GROUPS);
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
        { provide: TpRosterCopyReaderService, useValue: copyReader },
        { provide: TpRosterCopySelectionService, useValue: selection },
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
    expect(store.writeSnapshots).toHaveBeenCalledWith({
      ...SNAPSHOTS,
      rosterCopies: GROUPS,
    });
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
      rosterCopies: 2,
      rosterCopiesUndetermined: 1,
    });
  });

  it('reads every roster file it can open as a copy, and selects the copies the import sends', async () => {
    await service.run();

    expect(copyReader.read).toHaveBeenCalledTimes(1);
    expect(copyReader.read).toHaveBeenCalledWith({
      source: 'e/rosters_2.json',
      content: { file: 'e/rosters_2.json' },
    });
    expect(selection.select).toHaveBeenCalledWith({
      copies: [COPY],
      unreadable: [],
    });
  });

  it('locates a roster file it cannot open, so its group is undetermined', async () => {
    store.listSources.mockResolvedValue([BROKEN_ROSTER]);
    store.readSource.mockRejectedValue(new Error('not valid JSON'));

    await service.run();

    expect(copyReader.locate).toHaveBeenCalledWith('e/rosters_4.json');
    expect(selection.select).toHaveBeenCalledWith({
      copies: [],
      unreadable: [{ era: 'e', rosterId: '4' }],
    });
  });

  it('lists a roster file whose copy fields are unreadable when its line-ups were read', async () => {
    store.listSources.mockResolvedValue([ROSTER]);
    extractor.extract.mockReturnValue({
      kind: 'observations',
      observations: [],
    });
    copyReader.read.mockReturnValue({
      kind: 'unreadable',
      location: { era: 'e', rosterId: '2' },
      reason: 'id: required',
    });

    await service.run();

    expect(index.build).toHaveBeenCalledWith({
      observations: [],
      unreadable: [{ source: 'e/rosters_2.json', reason: 'id: required' }],
    });
    expect(selection.select).toHaveBeenCalledWith({
      copies: [],
      unreadable: [{ era: 'e', rosterId: '2' }],
    });
  });

  it('lists a roster file once when neither reading succeeds', async () => {
    store.listSources.mockResolvedValue([ROSTER]);
    copyReader.read.mockReturnValue({
      kind: 'unreadable',
      location: { era: 'e', rosterId: '2' },
      reason: 'id: required',
    });

    await service.run();

    expect(index.build).toHaveBeenCalledWith({
      observations: [],
      unreadable: [{ source: 'e/rosters_2.json', reason: 'lineUps: required' }],
    });
  });
});
