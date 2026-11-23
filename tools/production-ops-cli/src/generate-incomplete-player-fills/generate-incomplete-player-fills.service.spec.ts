import { WriteFileService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { TpFeedHistoryStoreService } from '../read-tp-feed-history/tp-feed-history-store.service';
import { TpRosterSnapshotsStoreService } from '../read-tp-roster-snapshots/tp-roster-snapshots-store.service';
import { eligibleInput, report } from './fill-plan.test-helpers';
import {
  type FillEntry,
  type FillPlan,
  type FillReport,
  type LastingInjuryRepairCandidate,
  type LastingInjuryRepairEntry,
  SKIP_REASONS,
} from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';
import { GenerateIncompletePlayerFillsService } from './generate-incomplete-player-fills.service';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';
import { LastingInjuryRepairSelectorService } from './lasting-injury-repair-selector.service';

const REPAIR: LastingInjuryRepairEntry = {
  player: { system: 'tourplay.net', id: '929761' },
};

const LINE = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };

function repairCandidate(id: string): LastingInjuryRepairCandidate {
  return {
    player: { system: 'tourplay.net', id },
    line: LINE,
    increases: [],
    context: null,
  };
}

const ENTRY: FillEntry = {
  player: { system: 'tourplay.net', id: '500' },
  status: 'retired',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 5,
  unspentSpp: 5,
  startingSkills: [],
  advancements: [],
};

/** A full skip tally: every reason present, empty unless overridden. */
function skippedWith(
  overrides: Partial<FillReport['skipped']> = {},
): FillReport['skipped'] {
  const skipped = {} as FillReport['skipped'];
  for (const reason of SKIP_REASONS) {
    skipped[reason] = overrides[reason] ?? { count: 0, players: [] };
  }
  return skipped;
}

function planWith(entries: FillEntry[]): FillPlan {
  return {
    entries,
    report: {
      considered: 1,
      eligible: entries.length,
      eligibleByStage: {
        noAdvancement: entries.length,
        advancement: 0,
        injuryOnly: 0,
        snapshot: 0,
        feedWithSnapshot: 0,
      },
      journeymenFilled: 0,
      feed: null,
      skipped: skippedWith(),
    },
  };
}

describe('GenerateIncompletePlayerFillsService', () => {
  let service: GenerateIncompletePlayerFillsService;
  let queries: MockProxy<IncompletePlayerFillQueriesService>;
  let planner: MockProxy<IncompletePlayerFillPlannerService>;
  let renderer: MockProxy<FillSectionRendererService>;
  let writeFile: MockProxy<WriteFileService>;
  let feedHistory: MockProxy<TpFeedHistoryStoreService>;
  let repairSelector: MockProxy<LastingInjuryRepairSelectorService>;
  let snapshotStore: MockProxy<TpRosterSnapshotsStoreService>;

  beforeEach(async () => {
    queries = mock<IncompletePlayerFillQueriesService>();
    planner = mock<IncompletePlayerFillPlannerService>();
    renderer = mock<FillSectionRendererService>();
    writeFile = mock<WriteFileService>();
    feedHistory = mock<TpFeedHistoryStoreService>();
    repairSelector = mock<LastingInjuryRepairSelectorService>();
    snapshotStore = mock<TpRosterSnapshotsStoreService>();
    queries.load.mockResolvedValue(eligibleInput());
    queries.loadLastingInjuryRepairCandidates.mockResolvedValue([]);
    repairSelector.select.mockReturnValue([]);
    planner.plan.mockReturnValue(planWith([ENTRY]));
    renderer.render.mockReturnValue('// file\n');
    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateIncompletePlayerFillsService,
        { provide: IncompletePlayerFillQueriesService, useValue: queries },
        { provide: IncompletePlayerFillPlannerService, useValue: planner },
        { provide: FillSectionRendererService, useValue: renderer },
        { provide: WriteFileService, useValue: writeFile },
        { provide: TpFeedHistoryStoreService, useValue: feedHistory },
        {
          provide: LastingInjuryRepairSelectorService,
          useValue: repairSelector,
        },
        { provide: TpRosterSnapshotsStoreService, useValue: snapshotStore },
      ],
    }).compile();
    service = moduleRef.get(GenerateIncompletePlayerFillsService);
  });

  it('plans from the loaded rows and prints the section with the report', async () => {
    const result = await service.run({});

    expect(planner.plan).toHaveBeenCalledWith(eligibleInput());
    expect(renderer.render).toHaveBeenCalledWith([ENTRY], []);
    expect(result).toEqual({
      report: {
        ...planWith([ENTRY]).report,
        ongoingCompetitions: [],
        lastingInjuryRepairs: 0,
        lastingInjuryRepairsNothingToRecord: 0,
      },
      section: '// file\n',
    });
    expect(writeFile.run).not.toHaveBeenCalled();
  });

  it('reports the competitions treated as ongoing', async () => {
    const ongoingCompetitions = [
      { competitionId: 2, name: 'Ogretoberfest 14', teamCount: 12 },
    ];
    queries.load.mockResolvedValue(eligibleInput({ ongoingCompetitions }));

    const result = await service.run({});

    expect(result.report.ongoingCompetitions).toEqual(ongoingCompetitions);
  });

  it('writes the section to the given path instead of printing it', async () => {
    writeFile.run.mockResolvedValue({ written: 'x.json5', bytes: 8 });

    const result = await service.run({ out: 'x.json5' });

    expect(writeFile.run).toHaveBeenCalledWith('x.json5', '// file\n');
    expect(result).toEqual({
      report: {
        ...planWith([ENTRY]).report,
        ongoingCompetitions: [],
        lastingInjuryRepairs: 0,
        lastingInjuryRepairsNothingToRecord: 0,
      },
      written: { written: 'x.json5', bytes: 8 },
    });
  });

  it('refuses to write a batch file with no entries', async () => {
    planner.plan.mockReturnValue(planWith([]));

    await expect(service.run({ out: 'x.json5' })).rejects.toThrow(
      'No incomplete player is eligible for a fill and no player needs his lasting reductions recorded; nothing written.',
    );
    expect(writeFile.run).not.toHaveBeenCalled();
  });

  it('renders and counts only the repairs the server would record', async () => {
    const candidates = [repairCandidate('929761'), repairCandidate('688945')];
    queries.loadLastingInjuryRepairCandidates.mockResolvedValue(candidates);
    repairSelector.select.mockReturnValue([REPAIR]);

    const result = await service.run({});

    expect(repairSelector.select).toHaveBeenCalledWith(candidates);
    expect(renderer.render).toHaveBeenCalledWith([ENTRY], [REPAIR]);
    expect(result.report.lastingInjuryRepairs).toBe(1);
    expect(result.report.lastingInjuryRepairsNothingToRecord).toBe(1);
  });

  it('writes nothing when no candidate has a reduction to record and nothing is eligible', async () => {
    planner.plan.mockReturnValue(planWith([]));
    queries.loadLastingInjuryRepairCandidates.mockResolvedValue([
      repairCandidate('929761'),
    ]);

    await expect(service.run({ out: 'x.json5' })).rejects.toThrow(
      'nothing written',
    );
    expect(writeFile.run).not.toHaveBeenCalled();
  });

  it('writes a batch file with repairs and no fills', async () => {
    planner.plan.mockReturnValue(planWith([]));
    repairSelector.select.mockReturnValue([REPAIR]);
    writeFile.run.mockResolvedValue({ written: 'x.json5', bytes: 8 });

    await service.run({ out: 'x.json5' });

    expect(writeFile.run).toHaveBeenCalledWith('x.json5', '// file\n');
  });

  it('reads the repairs only after the planner rows', async () => {
    queries.load.mockRejectedValue(new Error('Production query failed'));

    await expect(service.run({})).rejects.toThrow('Production query failed');
    expect(queries.loadLastingInjuryRepairCandidates).not.toHaveBeenCalled();
  });

  it('reports why every player was skipped when it refuses to write', async () => {
    planner.plan.mockReturnValue({
      entries: [],
      report: {
        considered: 2,
        eligible: 0,
        eligibleByStage: {
          noAdvancement: 0,
          advancement: 0,
          injuryOnly: 0,
          snapshot: 0,
          feedWithSnapshot: 0,
        },
        journeymenFilled: 0,
        feed: null,
        skipped: skippedWith({
          'spp-too-high': { count: 1, players: ['11'] },
          journeyman: { count: 1, players: ['12'] },
        }),
      },
    });

    const failure = await service
      .run({ out: 'x.json5' })
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain('nothing written');
    expect(message).toContain('"considered":2');
    expect(message).toContain('"spp-too-high":{"count":1,"players":["11"]}');
    expect(message).toContain('"journeyman":{"count":1,"players":["12"]}');
    expect(writeFile.run).not.toHaveBeenCalled();
  });

  it('prints an empty section when nothing is eligible and no path is given', async () => {
    planner.plan.mockReturnValue(planWith([]));

    await expect(service.run({})).resolves.toMatchObject({
      section: '// file\n',
    });
  });

  it('passes on a query failure without planning', async () => {
    queries.load.mockRejectedValue(new Error('Production query failed'));

    await expect(service.run({})).rejects.toThrow('Production query failed');
    expect(planner.plan).not.toHaveBeenCalled();
  });

  const FEED = { Firestarters: { '#13 Flame (Gnoblar Lineman)': [report()] } };

  it("plans with the feed channel's saved reports", async () => {
    feedHistory.readReports.mockResolvedValue(FEED);

    await service.run({ feedChannel: '1044490136337002506' });

    expect(feedHistory.readReports).toHaveBeenCalledWith('1044490136337002506');
    expect(planner.plan).toHaveBeenCalledWith({
      ...eligibleInput(),
      feed: FEED,
    });
  });

  it('fails on missing feed evidence before querying production', async () => {
    feedHistory.readReports.mockRejectedValue(
      new Error('reports.json does not exist'),
    );

    await expect(
      service.run({ feedChannel: '1044490136337002506' }),
    ).rejects.toThrow('reports.json does not exist');
    expect(queries.load).not.toHaveBeenCalled();
  });

  it('plans without feed evidence when no channel is given', async () => {
    await service.run({});

    expect(feedHistory.readReports).not.toHaveBeenCalled();
    expect(planner.plan).toHaveBeenCalledWith(eligibleInput());
  });

  it('reads the saved roster snapshots before any query, and hands them to the planner', async () => {
    const snapshots = {
      players: {},
      conflicts: [],
      unreadable: [],
      rosterCopies: [],
    };
    snapshotStore.readSnapshots.mockResolvedValue(snapshots);
    await service.run({ snapshots: true });

    expect(planner.plan).toHaveBeenCalledWith(eligibleInput({ snapshots }));
    expect(
      snapshotStore.readSnapshots.mock.invocationCallOrder[0],
    ).toBeLessThan(queries.load.mock.invocationCallOrder[0]);
  });

  it('stops before any query when the snapshots cannot be read', async () => {
    snapshotStore.readSnapshots.mockRejectedValue(
      new Error('run read-tp-roster-snapshots first.'),
    );

    await expect(service.run({ snapshots: true })).rejects.toThrow(
      /read-tp-roster-snapshots/,
    );
    expect(queries.load).not.toHaveBeenCalled();
  });

  it('reads no snapshots without the flag', async () => {
    await service.run({});

    expect(snapshotStore.readSnapshots).not.toHaveBeenCalled();
  });
});
