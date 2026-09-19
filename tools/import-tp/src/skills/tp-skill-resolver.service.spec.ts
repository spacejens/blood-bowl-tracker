import { ExternalIdResolverService } from '@blood-bowl-tracker/import';
import {
  AnimosityTargetService,
  HatredTargetService,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSkillResolverService } from './tp-skill-resolver.service';

/** The external system id every test's tpSystemId option supplies. */
const TP_SYSTEM_ID = 11;

describe('TpSkillResolverService', () => {
  let service: TpSkillResolverService;
  let resolver: MockProxy<ExternalIdResolverService>;
  let hatredTargets: MockProxy<HatredTargetService>;
  let animosityTargets: MockProxy<AnimosityTargetService>;

  beforeEach(async () => {
    resolver = mock<ExternalIdResolverService>();
    hatredTargets = mock<HatredTargetService>();
    animosityTargets = mock<AnimosityTargetService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSkillResolverService,
        { provide: ExternalIdResolverService, useValue: resolver },
        { provide: HatredTargetService, useValue: hatredTargets },
        { provide: AnimosityTargetService, useValue: animosityTargets },
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

  it("decodes a type-3 code with Hatred's table only for Hatred", () => {
    hatredTargets.decode.mockReturnValue('Undead');

    const target = service.decodeTypeThreeTarget(307, '110');

    expect(target).toBe('Undead');
    expect(hatredTargets.decode).toHaveBeenCalledWith('110');
    expect(animosityTargets.decode).not.toHaveBeenCalled();
  });

  it("decodes a type-3 code with Animosity's table only for Animosity", () => {
    animosityTargets.decode.mockReturnValue('Goblin');

    const target = service.decodeTypeThreeTarget(269, '111');

    expect(target).toBe('Goblin');
    expect(animosityTargets.decode).toHaveBeenCalledWith('111');
    expect(hatredTargets.decode).not.toHaveBeenCalled();
  });

  it('returns undefined for a type-3 code on any other skill', () => {
    const target = service.decodeTypeThreeTarget(87, '110');

    expect(target).toBeUndefined();
    expect(hatredTargets.decode).not.toHaveBeenCalled();
    expect(animosityTargets.decode).not.toHaveBeenCalled();
  });
});
