import { ExternalIdResolverService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  ANIMOSITY_SKILL_MASTER_ID,
  HATRED_SKILL_MASTER_ID,
  TpSkillResolverService,
} from './tp-skill-resolver.service';

/** The external system id every test's tpSystemId option supplies. */
const TP_SYSTEM_ID = 11;

describe('TpSkillResolverService', () => {
  let service: TpSkillResolverService;
  let resolver: MockProxy<ExternalIdResolverService>;

  beforeEach(async () => {
    resolver = mock<ExternalIdResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSkillResolverService,
        { provide: ExternalIdResolverService, useValue: resolver },
      ],
    }).compile();
    service = moduleRef.get(TpSkillResolverService);
  });

  it('inverts the scanned lookup into every master id per name', () => {
    const byName = service.collectSkillMasterIds(
      new Map([
        [87, { name: 'Dodge', isElite: false }],
        [188, { name: 'Dodge', isElite: false }],
        [220, { name: 'Block', isElite: true }],
      ]),
    );

    expect(byName).toEqual(
      new Map([
        ['Dodge', new Set([87, 188])],
        ['Block', new Set([220])],
      ]),
    );
  });

  it('resolves an unnamed master id through its curated tourplay.net external id', async () => {
    resolver.resolveBatch.mockResolvedValue([77]);

    const resolved = await service.resolveUnnamedMasterIds({
      masterIds: [181],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(resolver.resolveBatch).toHaveBeenCalledWith('skill', [
      { externalSystemId: TP_SYSTEM_ID, externalId: '181' },
    ]);
    expect(resolved).toEqual(new Map([[181, 77]]));
  });

  it('leaves an unnamed master id out when no curated external id resolves it', async () => {
    resolver.resolveBatch.mockResolvedValue([undefined]);

    const resolved = await service.resolveUnnamedMasterIds({
      masterIds: [999_999],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(resolved).toEqual(new Map());
  });

  it('makes one batched resolve call for every unnamed id', async () => {
    resolver.resolveBatch.mockResolvedValue([77, 78]);

    await service.resolveUnnamedMasterIds({
      masterIds: [181, 182],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(resolver.resolveBatch).toHaveBeenCalledTimes(1);
    expect(resolver.resolveBatch).toHaveBeenCalledWith('skill', [
      { externalSystemId: TP_SYSTEM_ID, externalId: '181' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '182' },
    ]);
  });

  // Hatred and Animosity now read the SAME curated keyword catalogue: a
  // type-3 target is a keyword, whichever of the two skills names it, so
  // there is no longer a "belongs to the other skill's table" case to test
  // -- that behaviour was dropped deliberately, not by accident, when the
  // two hard-coded per-skill tables were replaced by one shared catalogue.
  const catalog = {
    byCode: new Map([
      [100, { keywordId: 1, name: 'Dwarf' }],
      [111, { keywordId: 7, name: 'Goblin' }],
      [134, { keywordId: 8, name: 'Big Guy' }],
      [999, { keywordId: 9, name: 'All' }],
    ]),
  };

  it('decodes a Hatred target code to its curated keyword name', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: '111',
        catalog,
      }),
    ).toBe('Goblin');
  });

  it('decodes a Hatred target that is a positional keyword', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: '134',
        catalog,
      }),
    ).toBe('Big Guy');
  });

  it('decodes an Animosity target code', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: ANIMOSITY_SKILL_MASTER_ID,
        attributeValue: '999',
        catalog,
      }),
    ).toBe('All');
  });

  it('returns undefined for a code the catalogue does not carry', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: '777',
        catalog,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a non-numeric attribute value', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: HATRED_SKILL_MASTER_ID,
        attributeValue: 'Goblin',
        catalog,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for a skill that is neither Hatred nor Animosity', () => {
    expect(
      service.decodeTypeThreeTarget({
        skillMasterId: 1,
        attributeValue: '111',
        catalog,
      }),
    ).toBeUndefined();
  });
});
