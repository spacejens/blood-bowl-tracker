import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { InscriptionsParserService } from './inscriptions-parser.service';

describe('InscriptionsParserService', () => {
  let service: InscriptionsParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [InscriptionsParserService],
    }).compile();
    service = moduleRef.get(InscriptionsParserService);
  });

  it('flattens every category into one TpCoach[] with trimmed names', () => {
    const result = service.parseCoaches({
      '22494': [
        {
          player: {
            id: '17cc91d4-aaf6-45c9-134d-08dacad31bb4',
            userNameToShow: 'Andreas Gunnarsson ',
            nafNumber: 19767,
          },
        },
      ],
      '22495': [
        {
          player: {
            id: 'bbbb2222-aaf6-45c9-134d-08dacad31bb4',
            userNameToShow: 'Second Coach',
            nafNumber: 100,
          },
        },
      ],
    });

    expect(result).toEqual([
      {
        id: '17cc91d4-aaf6-45c9-134d-08dacad31bb4',
        name: 'Andreas Gunnarsson',
        nafNumber: 19767,
      },
      {
        id: 'bbbb2222-aaf6-45c9-134d-08dacad31bb4',
        name: 'Second Coach',
        nafNumber: 100,
      },
    ]);
  });

  it('omits nafNumber when the player has none', () => {
    const result = service.parseCoaches({
      '1': [
        {
          player: {
            id: 'no-naf-id',
            userNameToShow: 'No Naf Coach',
          },
        },
      ],
    });

    expect(result).toEqual([{ id: 'no-naf-id', name: 'No Naf Coach' }]);
    expect(result[0]).not.toHaveProperty('nafNumber');
  });

  it('drops extra unrecognized fields on the entry and player, not rejecting them', () => {
    const result = service.parseCoaches({
      '1': [
        {
          state: 7,
          inscriptionDate: '2021-01-01',
          player: {
            id: 'id-1',
            userNameToShow: 'Coach',
            nafNumber: 5,
            nafUser: 'moldline',
            nafVerified: true,
            country: 'SE',
            language: 'en',
          },
          roster: { teamName: 'X' },
        },
      ],
    });

    expect(result).toEqual([{ id: 'id-1', name: 'Coach', nafNumber: 5 }]);
  });

  it('keeps duplicate ids across categories (dedup is the importer job)', () => {
    const result = service.parseCoaches({
      '1': [{ player: { id: 'dup', userNameToShow: 'A' } }],
      '2': [{ player: { id: 'dup', userNameToShow: 'A' } }],
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('dup');
    expect(result[1].id).toBe('dup');
  });

  it('returns an empty array for an empty inscriptions object', () => {
    expect(service.parseCoaches({})).toEqual([]);
  });

  it('throws naming the field when player.id is missing', () => {
    expect(() =>
      service.parseCoaches({ '1': [{ player: { userNameToShow: 'A' } }] }),
    ).toThrow(/id/);
  });

  it('throws naming the field when player.userNameToShow is missing', () => {
    expect(() =>
      service.parseCoaches({ '1': [{ player: { id: 'x' } }] }),
    ).toThrow(/userNameToShow/);
  });

  it('throws when nafNumber is present but not a number', () => {
    expect(() =>
      service.parseCoaches({
        '1': [{ player: { id: 'x', userNameToShow: 'A', nafNumber: 'nope' } }],
      }),
    ).toThrow(/nafNumber/);
  });

  it('throws when a category value is not an array', () => {
    expect(() => service.parseCoaches({ '1': { not: 'an array' } })).toThrow();
  });

  it('throws when the body is not an object', () => {
    expect(() => service.parseCoaches(null)).toThrow();
    expect(() => service.parseCoaches('not json')).toThrow();
  });
});
