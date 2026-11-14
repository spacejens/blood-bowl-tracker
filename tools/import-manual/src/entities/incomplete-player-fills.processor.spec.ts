import { IncompletePlayerFillImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { IncompletePlayerFillEntry } from '../data-file/manual-data-file.schema';
import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { IncompletePlayerFillsProcessor } from './incomplete-player-fills.processor';

const entry: IncompletePlayerFillEntry = {
  player: { system: 'tourplay.net', id: '586220' },
  status: 'active',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 18,
  unspentSpp: 0,
  startingSkills: [
    { system: 'Name', id: 'Block' },
    { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
  ],
  advancements: [
    { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
    { characteristic: 'AG' },
    {
      skill: { system: 'Name', id: 'Hatred' },
      attributeValue: 'Dwarf',
      freeExtra: true,
    },
  ],
};

function makeContext(fills: IncompletePlayerFillEntry[]): ProcessContext {
  return {
    data: {
      ...ManualDataFileSchema.parse({}),
      incompletePlayerFills: fills,
    },
    systemIds: new Map([
      ['Name', 2],
      ['tourplay.net', 3],
    ]),
    errors: [],
  };
}

describe('IncompletePlayerFillsProcessor', () => {
  let processor: IncompletePlayerFillsProcessor;
  let refResolver: MockProxy<ReferenceResolverService>;
  let fills: MockProxy<IncompletePlayerFillImportService>;

  beforeEach(async () => {
    refResolver = mock<ReferenceResolverService>();
    fills = mock<IncompletePlayerFillImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillsProcessor,
        { provide: ReferenceResolverService, useValue: refResolver },
        { provide: IncompletePlayerFillImportService, useValue: fills },
      ],
    }).compile();
    processor = moduleRef.get(IncompletePlayerFillsProcessor);
  });

  it('resolves the player and every skill, then sends the whole fill', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([70, 71, 72, 73]);
    fills.fill.mockResolvedValue({ playerId: 9, outcome: 'filled' });
    const ctx = makeContext([entry]);

    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: entry.player,
        kind: 'player',
        item: entry,
        label: 'Cannot fill in player tourplay.net 586220',
      }),
    );
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: [
          { system: 'Name', id: 'Block' },
          { system: 'Name', id: 'Loner' },
          { system: 'Name', id: 'Dodge' },
          { system: 'Name', id: 'Hatred' },
        ],
        kind: 'skill',
      }),
    );
    expect(fills.fill).toHaveBeenCalledWith(
      {
        playerId: 9,
        status: 'active',
        characteristics: {
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
        sppTotal: 18,
        unspentSpp: 0,
        startingSkills: [
          { skillId: 70, attributeValue: null },
          { skillId: 71, attributeValue: '4+' },
        ],
        advancements: [
          {
            kind: 'skill',
            skillId: 72,
            attributeValue: null,
            source: 'chosen',
            isFreeExtra: false,
          },
          { kind: 'characteristic', characteristic: 'AG' },
          {
            kind: 'skill',
            skillId: 73,
            attributeValue: 'Dwarf',
            source: 'advancement',
            isFreeExtra: true,
          },
        ],
      },
      ctx.errors,
    );
  });

  it('sends a null passing when pa is left out', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([]);
    fills.fill.mockResolvedValue({ playerId: 9, outcome: 'filled' });

    await processor.process(
      makeContext([
        {
          ...entry,
          characteristics: { ma: 6, st: 3, ag: 3, av: 9 },
          startingSkills: [],
          advancements: [],
        },
      ]),
    );

    expect(fills.fill.mock.calls[0][0].characteristics.passing).toBeNull();
  });

  it('counts a fill the server finds unchanged as accepted', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([70, 71, 72, 73]);
    fills.fill.mockResolvedValue({ playerId: 9, outcome: 'unchanged' });

    expect(await processor.process(makeContext([entry]))).toBe(1);
  });

  it('skips an entry whose player does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(refResolver.resolveRefs).not.toHaveBeenCalled();
    expect(fills.fill).not.toHaveBeenCalled();
  });

  it('skips an entry whose skills do not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(fills.fill).not.toHaveBeenCalled();
  });

  it('carries on after a refused entry', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.resolveRefs.mockResolvedValue([70, 71, 72, 73]);
    fills.fill
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ playerId: 9, outcome: 'filled' });

    expect(await processor.process(makeContext([entry, entry]))).toBe(1);
    expect(fills.fill).toHaveBeenCalledTimes(2);
  });
});
