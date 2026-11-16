import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { EntryParts } from './fill-entry-builder.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import { candidate, profile } from './fill-plan.test-helpers';
import type { StoredAdvancementRow } from './fill-plan.types';

const LINE = { ma: 7, st: 3, ag: 3, pa: 4, av: 9 };

const PARTS: EntryParts = {
  candidate: candidate(),
  line: LINE,
  profile: profile(),
  sppTotal: 20,
  unspentSpp: 2,
  status: 'retired',
  advancements: [],
};

function startingBlock(
  overrides: Partial<StoredAdvancementRow> = {},
): StoredAdvancementRow {
  return {
    playerId: 1,
    source: 'starting',
    skillId: 100,
    skillName: 'Block',
    attributeValue: null,
    isFreeExtra: false,
    ...overrides,
  };
}

describe('FillEntryBuilderService', () => {
  let service: FillEntryBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FillEntryBuilderService],
    }).compile();
    service = moduleRef.get(FillEntryBuilderService);
  });

  describe('build', () => {
    it('writes the line, SPP, starting skills and advancements given', () => {
      expect(
        service.build({
          candidate: candidate(),
          line: LINE,
          profile: profile(),
          sppTotal: 20,
          unspentSpp: 2,
          status: 'retired',
          advancements: [
            { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
            { characteristic: 'MA' },
          ],
        }),
      ).toEqual({
        player: { system: 'tourplay.net', id: '500' },
        status: 'retired',
        characteristics: LINE,
        sppTotal: 20,
        unspentSpp: 2,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [
          { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
          { characteristic: 'MA' },
        ],
      });
    });

    it("marks a journeyman's entry, right after the player", () => {
      const entry = service.build({
        ...PARTS,
        candidate: candidate({ isJourneyman: true }),
      });

      expect(entry.journeyman).toBe(true);
      expect(Object.keys(entry).slice(0, 2)).toEqual(['player', 'journeyman']);
    });

    it('leaves the field out for anyone else', () => {
      expect(service.build(PARTS)).not.toHaveProperty('journeyman');
    });

    it('leaves pa out when the line has none', () => {
      const entry = service.build({
        candidate: candidate(),
        line: { ...LINE, pa: null },
        profile: profile(),
        sppTotal: 5,
        unspentSpp: 5,
        status: 'dead',
        advancements: [],
      });

      expect(entry.characteristics).toEqual({ ma: 7, st: 3, ag: 3, av: 9 });
    });

    it('writes a variant starting skill with its attribute value', () => {
      const entry = service.build({
        candidate: candidate(),
        line: LINE,
        profile: profile({
          skills: [{ skillId: 102, nameId: 'Loner', attributeValue: '4+' }],
        }),
        sppTotal: 5,
        unspentSpp: 5,
        status: 'retired',
        advancements: [],
      });

      expect(entry.startingSkills).toEqual([
        { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
      ]);
    });
  });

  describe('contradicts', () => {
    const base = {
      candidate: candidate(),
      stored: [] as StoredAdvancementRow[],
      profile: profile(),
      line: LINE,
      unspentSpp: 2,
    };

    it('accepts unset stored data', () => {
      expect(service.contradicts(base)).toBe(false);
    });

    it('accepts stored values equal to the entry', () => {
      expect(
        service.contradicts({
          ...base,
          candidate: candidate({
            move: 7,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
            unspentSpp: 2,
          }),
          stored: [startingBlock()],
        }),
      ).toBe(false);
    });

    it.each([
      ['a stored MA', { move: 6 }],
      ['a stored ST', { strength: 4 }],
      ['a stored AG', { agility: 2 }],
      ['a stored AV', { armour: 8 }],
      ['a stored PA', { passing: 3 }],
      ['a stored unspent SPP', { unspentSpp: 3 }],
    ])('refuses %s that differs', (_name, overrides) => {
      expect(
        service.contradicts({ ...base, candidate: candidate(overrides) }),
      ).toBe(true);
    });

    it('refuses a stored PA where the line has none', () => {
      expect(
        service.contradicts({
          ...base,
          line: { ...LINE, pa: null },
          candidate: candidate({ passing: 4 }),
        }),
      ).toBe(true);
    });

    it('refuses a stored gained row', () => {
      expect(
        service.contradicts({
          ...base,
          stored: [startingBlock({ source: 'chosen' })],
        }),
      ).toBe(true);
    });

    it('refuses a stored starting skill the position does not list', () => {
      expect(
        service.contradicts({
          ...base,
          stored: [startingBlock({ skillId: 101 })],
        }),
      ).toBe(true);
    });

    it('refuses a stored starting skill with another variant', () => {
      expect(
        service.contradicts({
          ...base,
          stored: [startingBlock({ attributeValue: '+1' })],
        }),
      ).toBe(true);
    });
  });

  describe('status', () => {
    it('keeps a stored status, even over a death', () => {
      expect(service.status(candidate({ status: 'active' }), true)).toBe(
        'active',
      );
    });

    it('is dead when a death is recorded, else retired', () => {
      expect(service.status(candidate(), true)).toBe('dead');
      expect(service.status(candidate(), false)).toBe('retired');
    });
  });
});
