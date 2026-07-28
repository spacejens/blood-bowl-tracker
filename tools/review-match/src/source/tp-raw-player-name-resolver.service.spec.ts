import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRawPlayerNameResolverService } from './tp-raw-player-name-resolver.service';

const file = {
  inscriptionLocal: {
    roster: {
      id: 10,
      lineUps: [
        { id: 1, name: 'Grim Ironjaw', number: 1 },
        { id: 2, name: 'Boomer Eziasson', number: 2 },
      ],
    },
  },
  inscriptionVisitor: {
    roster: {
      id: 20,
      lineUps: [{ id: 3, name: 'Varag Ghoul-Chewer', number: 1 }],
    },
  },
};

describe('TpRawPlayerNameResolverService', () => {
  let service: TpRawPlayerNameResolverService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRawPlayerNameResolverService],
    }).compile();
    service = moduleRef.get(TpRawPlayerNameResolverService);
  });

  describe('namesFrom', () => {
    it('maps every line-up id from both rosters to its name', () => {
      expect(service.namesFrom(file)).toEqual(
        new Map([
          [1, 'Grim Ironjaw'],
          [2, 'Boomer Eziasson'],
          [3, 'Varag Ghoul-Chewer'],
        ]),
      );
    });

    it('returns an empty map for a file with no inscriptions at all', () => {
      expect(service.namesFrom({ matchEvents: [] })).toEqual(new Map());
    });

    it('returns an empty map rather than throwing on a malformed shape', () => {
      expect(
        service.namesFrom({
          inscriptionLocal: { roster: { lineUps: 'nope' } },
        }),
      ).toEqual(new Map());
    });

    it('returns an empty map for a non-object file', () => {
      expect(service.namesFrom(null)).toEqual(new Map());
      expect(service.namesFrom('a string')).toEqual(new Map());
    });

    it('skips line-up entries missing a numeric id or a string name', () => {
      const names = service.namesFrom({
        inscriptionLocal: {
          roster: {
            lineUps: [
              { name: 'No id' },
              { id: 5 },
              { id: '6', name: 'String id' },
              'not an object',
              null,
              { id: 7, name: 'Kept' },
            ],
          },
        },
      });

      expect(names).toEqual(new Map([[7, 'Kept']]));
    });
  });

  describe('nameFor', () => {
    it('returns the name for a known line-up id', () => {
      expect(service.nameFor(service.namesFrom(file), 2)).toBe(
        'Boomer Eziasson',
      );
    });

    it('shows the unresolved id explicitly, so the gap is visible', () => {
      expect(service.nameFor(service.namesFrom(file), 99)).toBe(
        'unknown id 99',
      );
    });
  });
});
