import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TournamentParserService } from './tournament-parser.service';

describe('TournamentParserService', () => {
  let service: TournamentParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TournamentParserService],
    }).compile();
    service = moduleRef.get(TournamentParserService);
  });

  it('extracts id, name, ruleSet and phases from a valid tournament body', () => {
    const result = service.parse({
      id: 12345,
      name: 'tLoEGBBL Chaos Cup 8',
      ruleSet: 25,
      // Unrelated fields that must be ignored, not rejected:
      categories: [{ id: 1 }],
      scoringRules: { win: 3 },
    });
    expect(result).toEqual({
      id: 12345,
      name: 'tLoEGBBL Chaos Cup 8',
      ruleSet: 25,
      phases: [],
      categoryIds: [1],
    });
  });

  it("flattens every category's phases, in listed order, to their id and order", () => {
    const result = service.parse({
      id: 18442,
      name: 'tLoEGBBL Säsong 30',
      ruleSet: 25,
      categories: [
        {
          id: 22308,
          phases: [
            { id: 31255, order: 1, type: 160, roundName: 'MATCHDAY' },
            { id: 34100, order: 2, type: 30 },
          ],
        },
        { id: 22309, phases: [{ id: 34101, order: 3 }] },
      ],
    });
    expect(result.phases).toEqual([
      { id: 31255, order: 1 },
      { id: 34100, order: 2 },
      { id: 34101, order: 3 },
    ]);
  });

  it('returns no phases when the tournament lists no categories', () => {
    expect(service.parse({ id: 1, name: 'X', ruleSet: 25 }).phases).toEqual([]);
  });

  it('throws naming the field when a phase has no order', () => {
    expect(() =>
      service.parse({
        id: 1,
        name: 'X',
        ruleSet: 25,
        categories: [{ phases: [{ id: 5 }] }],
      }),
    ).toThrow(/order/);
  });

  it('throws naming the field when id is missing', () => {
    expect(() => service.parse({ name: 'X', ruleSet: 25 })).toThrow(/id/);
  });

  it('throws naming the field when id is not a number', () => {
    expect(() => service.parse({ id: 'nope', name: 'X', ruleSet: 25 })).toThrow(
      /id/,
    );
  });

  it('throws naming the field when name is missing', () => {
    expect(() => service.parse({ id: 1, ruleSet: 25 })).toThrow(/name/);
  });

  it('throws naming the field when name is not a string', () => {
    expect(() => service.parse({ id: 1, name: 42, ruleSet: 25 })).toThrow(
      /name/,
    );
  });

  it('throws naming the field when ruleSet is missing', () => {
    expect(() => service.parse({ id: 1, name: 'X' })).toThrow(/ruleSet/);
  });

  it('throws naming the field when ruleSet is not a number', () => {
    expect(() =>
      service.parse({ id: 1, name: 'X', ruleSet: 'twenty' }),
    ).toThrow(/ruleSet/);
  });

  it('throws when the body is not an object', () => {
    expect(() => service.parse(null)).toThrow();
    expect(() => service.parse('not json')).toThrow();
  });

  it("lists every category's id, in listed order", () => {
    const result = service.parse({
      id: 18442,
      name: 'tLoEGBBL Säsong 30',
      ruleSet: 25,
      categories: [{ id: 22308 }, { id: 22309, phases: [] }],
    });
    expect(result.categoryIds).toEqual([22308, 22309]);
  });

  it('returns no category ids when the tournament lists no categories', () => {
    expect(
      service.parse({ id: 1, name: 'X', ruleSet: 25 }).categoryIds,
    ).toEqual([]);
  });

  it('throws naming the field when a category has no id', () => {
    expect(() =>
      service.parse({ id: 1, name: 'X', ruleSet: 25, categories: [{}] }),
    ).toThrow(/categories\.0\.id/);
  });
});
