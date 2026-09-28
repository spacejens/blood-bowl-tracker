import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ANIMOSITY_SKILL_MASTER_ID,
  HATRED_SKILL_MASTER_ID,
  TpKeywordTargetDecoderService,
} from './tp-keyword-target-decoder.service';
import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';

const CATALOG: TpOfficialKeywordCatalog = {
  byCode: new Map([[111, { keywordId: 5, name: 'Dwarf' }]]),
};

describe('TpKeywordTargetDecoderService', () => {
  let service: TpKeywordTargetDecoderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpKeywordTargetDecoderService],
    }).compile();
    service = moduleRef.get(TpKeywordTargetDecoderService);
  });

  it('names the keyword a Hatred code targets', () => {
    expect(
      service.decode({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: '111',
        catalog: CATALOG,
      }),
    ).toBe('Dwarf');
  });

  it('names the keyword an Animosity code targets', () => {
    expect(
      service.decode({
        skillMasterId: ANIMOSITY_SKILL_MASTER_ID,
        attributeValue: '111',
        catalog: CATALOG,
      }),
    ).toBe('Dwarf');
  });

  it('decodes nothing for a skill other than Hatred or Animosity', () => {
    expect(
      service.decode({
        skillMasterId: 41,
        attributeValue: '111',
        catalog: CATALOG,
      }),
    ).toBeUndefined();
  });

  it('decodes nothing for a value that is not an integer code', () => {
    expect(
      service.decode({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: 'Dwarf',
        catalog: CATALOG,
      }),
    ).toBeUndefined();
  });

  it('decodes nothing for a code the catalogue does not carry', () => {
    expect(
      service.decode({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: '999',
        catalog: CATALOG,
      }),
    ).toBeUndefined();
  });
});
