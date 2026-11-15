import { Test } from '@nestjs/testing';
import JSON5 from 'json5';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FillEntry } from './fill-plan.types';
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

describe('FillSectionRendererService', () => {
  let service: FillSectionRendererService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FillSectionRendererService],
    }).compile();
    service = moduleRef.get(FillSectionRendererService);
  });

  it('renders the entries with the external systems they reference', () => {
    expect(JSON5.parse(service.render([ENTRY]))).toEqual({
      externalSystems: [
        { name: 'Name', category: 'bookkeeping' },
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      incompletePlayerFills: [ENTRY],
    });
  });

  it('renders valid JSON5 with no entries', () => {
    expect(JSON5.parse(service.render([]))).toEqual({
      externalSystems: [
        { name: 'Name', category: 'bookkeeping' },
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      incompletePlayerFills: [],
    });
  });

  it('opens with a comment naming the generator and ends with a newline', () => {
    const text = service.render([ENTRY]);

    expect(text.startsWith('// ')).toBe(true);
    expect(text).toContain('generate-incomplete-player-fills');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('writes keys unquoted and strings single-quoted', () => {
    const text = service.render([ENTRY]);

    expect(text).toContain('player: {\n');
    expect(text).toContain("system: 'tourplay.net'");
  });
});
