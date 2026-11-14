import { WriteFileService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { eligibleInput } from './fill-plan.test-helpers';
import type { FillEntry, FillPlan } from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';
import { GenerateIncompletePlayerFillsService } from './generate-incomplete-player-fills.service';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';

const ENTRY: FillEntry = {
  player: { system: 'tourplay.net', id: '500' },
  status: 'retired',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 5,
  unspentSpp: 5,
  startingSkills: [],
  advancements: [],
};

function planWith(entries: FillEntry[]): FillPlan {
  return {
    entries,
    report: {
      considered: 1,
      eligible: entries.length,
      skipped: {} as FillPlan['report']['skipped'],
    },
  };
}

describe('GenerateIncompletePlayerFillsService', () => {
  let service: GenerateIncompletePlayerFillsService;
  let queries: MockProxy<IncompletePlayerFillQueriesService>;
  let planner: MockProxy<IncompletePlayerFillPlannerService>;
  let renderer: MockProxy<FillSectionRendererService>;
  let writeFile: MockProxy<WriteFileService>;

  beforeEach(async () => {
    queries = mock<IncompletePlayerFillQueriesService>();
    planner = mock<IncompletePlayerFillPlannerService>();
    renderer = mock<FillSectionRendererService>();
    writeFile = mock<WriteFileService>();
    queries.load.mockResolvedValue(eligibleInput());
    planner.plan.mockReturnValue(planWith([ENTRY]));
    renderer.render.mockReturnValue('// file\n');
    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateIncompletePlayerFillsService,
        { provide: IncompletePlayerFillQueriesService, useValue: queries },
        { provide: IncompletePlayerFillPlannerService, useValue: planner },
        { provide: FillSectionRendererService, useValue: renderer },
        { provide: WriteFileService, useValue: writeFile },
      ],
    }).compile();
    service = moduleRef.get(GenerateIncompletePlayerFillsService);
  });

  it('plans from the loaded rows and prints the section with the report', async () => {
    const result = await service.run({});

    expect(planner.plan).toHaveBeenCalledWith(eligibleInput());
    expect(renderer.render).toHaveBeenCalledWith([ENTRY]);
    expect(result).toEqual({
      report: planWith([ENTRY]).report,
      section: '// file\n',
    });
    expect(writeFile.run).not.toHaveBeenCalled();
  });

  it('writes the section to the given path instead of printing it', async () => {
    writeFile.run.mockResolvedValue({ written: 'x.json5', bytes: 8 });

    const result = await service.run({ out: 'x.json5' });

    expect(writeFile.run).toHaveBeenCalledWith('x.json5', '// file\n');
    expect(result).toEqual({
      report: planWith([ENTRY]).report,
      written: { written: 'x.json5', bytes: 8 },
    });
  });

  it('refuses to write a batch file with no entries', async () => {
    planner.plan.mockReturnValue(planWith([]));

    await expect(service.run({ out: 'x.json5' })).rejects.toThrow(
      'No incomplete player is eligible for a fill; nothing written.',
    );
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
});
