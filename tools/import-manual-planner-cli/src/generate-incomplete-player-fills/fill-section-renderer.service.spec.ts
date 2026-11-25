import { Test } from '@nestjs/testing';
import JSON5 from 'json5';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';
import { FillSectionRendererService } from './fill-section-renderer.service';

const ENTRY: FillEntry = {
  player: { system: 'tourplay.net', id: '500' },
  status: 'retired',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 5,
  unspentSpp: 5,
  startingSkills: [{ system: 'Name', id: 'Block' }],
  advancements: [],
};

const REPAIR: LastingInjuryRepairEntry = {
  player: { system: 'tourplay.net', id: '929761' },
};

describe('FillSectionRendererService', () => {
  let service: FillSectionRendererService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FillSectionRendererService],
    }).compile();
    service = moduleRef.get(FillSectionRendererService);
  });

  it('renders the entries with the external systems they reference', () => {
    expect(JSON5.parse(service.render([ENTRY], []))).toEqual({
      externalSystems: [
        { name: 'Name', category: 'bookkeeping' },
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      incompletePlayerFills: [ENTRY],
      lastingInjuryRepairs: [],
    });
  });

  it('renders valid JSON5 with no entries', () => {
    expect(JSON5.parse(service.render([], []))).toEqual({
      externalSystems: [
        { name: 'Name', category: 'bookkeeping' },
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      incompletePlayerFills: [],
      lastingInjuryRepairs: [],
    });
  });

  it('opens with a comment naming the generator and ends with a newline', () => {
    const text = service.render([ENTRY], []);

    expect(text.startsWith('// ')).toBe(true);
    expect(text).toContain('generate-incomplete-player-fills');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('writes keys unquoted and strings single-quoted', () => {
    const text = service.render([ENTRY], []);

    expect(text).toContain('player: {\n');
    expect(text).toContain("system: 'tourplay.net'");
  });

  it('renders advancements as the batch format writes them', () => {
    const entry: FillEntry = {
      ...ENTRY,
      advancements: [
        {
          skill: { system: 'Name', id: 'Mighty Blow' },
          attributeValue: '+1',
          source: 'random',
        },
        { characteristic: 'MA' },
      ],
    };

    expect(
      JSON5.parse<{ incompletePlayerFills: FillEntry[] }>(
        service.render([entry], []),
      ).incompletePlayerFills,
    ).toEqual([entry]);
  });

  it('renders the repairs after the fills', () => {
    const text = service.render([ENTRY], [REPAIR]);

    expect(JSON5.parse(text)).toEqual({
      externalSystems: [
        { name: 'Name', category: 'bookkeeping' },
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      incompletePlayerFills: [ENTRY],
      lastingInjuryRepairs: [REPAIR],
    });
    expect(text.indexOf('lastingInjuryRepairs')).toBeGreaterThan(
      text.indexOf('incompletePlayerFills'),
    );
  });

  it('refuses a fill the batch schema rejects', () => {
    const bad: FillEntry = {
      ...ENTRY,
      characteristics: { ...ENTRY.characteristics, ma: 0 },
    };

    expect(() => service.render([bad], [])).toThrow(
      /^Generated incompletePlayerFills do not match the batch schema/,
    );
  });

  it('refuses a repair entry the batch schema rejects', () => {
    const bad = {
      ...REPAIR,
      extra: true,
    } as LastingInjuryRepairEntry;

    expect(() => service.render([ENTRY], [bad])).toThrow(
      /^Generated lastingInjuryRepairs do not match the batch schema/,
    );
  });
});
