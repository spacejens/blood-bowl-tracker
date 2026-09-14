import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SustainedInjuriesParser } from './sustained-injuries.parser';

/** No lasting injury of any kind. */
const CLEAN = {
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

describe('SustainedInjuriesParser', () => {
  let parser: SustainedInjuriesParser;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SustainedInjuriesParser],
    }).compile();
    parser = moduleRef.get(SustainedInjuriesParser);
  });

  it('reads BBL\'s explicit "none" as no injury at all', () => {
    expect(parser.parse('none')).toEqual(CLEAN);
  });

  it('reads an empty cell as no injury at all', () => {
    expect(parser.parse('')).toEqual(CLEAN);
  });

  it('counts a single stat reduction on its own characteristic', () => {
    expect(parser.parse('-AV')).toEqual({ ...CLEAN, armourReductionCount: 1 });
    expect(parser.parse('-PA')).toEqual({ ...CLEAN, passingReductionCount: 1 });
    expect(parser.parse('-MA')).toEqual({ ...CLEAN, moveReductionCount: 1 });
    expect(parser.parse('-ST')).toEqual({
      ...CLEAN,
      strengthReductionCount: 1,
    });
    expect(parser.parse('-AG')).toEqual({ ...CLEAN, agilityReductionCount: 1 });
  });

  it('counts repeats of the same stat', () => {
    expect(parser.parse('-AG, -AG, -AG')).toEqual({
      ...CLEAN,
      agilityReductionCount: 3,
    });
  });

  it('counts several different stats in one cell', () => {
    expect(parser.parse('-MA, -AV, -AV')).toEqual({
      ...CLEAN,
      moveReductionCount: 1,
      armourReductionCount: 2,
    });
  });

  it('does not count a reduction the rules absorbed', () => {
    // "(no effect)" means the stat was already at its floor, or at the rules'
    // cap on reductions, so the stored characteristic never moved — and these
    // columns hold the effective magnitude, not an occurrence tally.
    expect(parser.parse('-ST (no effect)')).toEqual(CLEAN);
  });

  it('counts the effective reductions alongside an absorbed one', () => {
    expect(parser.parse('-ST (no effect), -AG')).toEqual({
      ...CLEAN,
      agilityReductionCount: 1,
    });
    expect(parser.parse('-MA, -ST (no effect)')).toEqual({
      ...CLEAN,
      moveReductionCount: 1,
    });
  });

  it('does not treat an absorbed reduction as a miss-next-game', () => {
    // BBL prints the miss-next-game line itself when it applies; pid 2381 has
    // "(no effect)" and no such line, so the player is not currently out.
    expect(parser.parse('-ST (no effect), -AG, 1 niggling inj.')).toEqual({
      ...CLEAN,
      agilityReductionCount: 1,
      nigglingInjuryCount: 1,
    });
  });

  it('reads the niggling-injury count', () => {
    expect(parser.parse('1 niggling inj.')).toEqual({
      ...CLEAN,
      nigglingInjuryCount: 1,
    });
    expect(parser.parse('3 niggling inj.')).toEqual({
      ...CLEAN,
      nigglingInjuryCount: 3,
    });
  });

  it("accepts the injury sub-page's abbreviated spelling", () => {
    expect(parser.parse('2 niggl.')).toEqual({
      ...CLEAN,
      nigglingInjuryCount: 2,
    });
  });

  it('reads the miss-next-game line', () => {
    expect(parser.parse('Must miss the next match due to injury')).toEqual({
      ...CLEAN,
      missNextGame: true,
    });
  });

  it('reads a miss-next-game that cheerio ran together with the text before it', () => {
    // `.text()` drops the <br> with no separator, so the sentence arrives
    // glued to whatever preceded it.
    expect(
      parser.parse('1 niggling inj.Must miss the next match due to injury'),
    ).toEqual({ ...CLEAN, nigglingInjuryCount: 1, missNextGame: true });
    expect(parser.parse('-AVMust miss the next match due to injury')).toEqual({
      ...CLEAN,
      armourReductionCount: 1,
      missNextGame: true,
    });
  });

  it('reads a full combination', () => {
    expect(
      parser.parse(
        '-AV, 2 niggling inj.Must miss the next match due to injury',
      ),
    ).toEqual({
      ...CLEAN,
      armourReductionCount: 1,
      nigglingInjuryCount: 2,
      missNextGame: true,
    });
  });

  it('ignores the death marker, which this feature does not track', () => {
    expect(parser.parse('DEATH!')).toEqual(CLEAN);
    expect(parser.parse('-AV DEATH!')).toEqual({
      ...CLEAN,
      armourReductionCount: 1,
    });
    expect(parser.parse('-AV, 1 niggling inj. DEATH!')).toEqual({
      ...CLEAN,
      armourReductionCount: 1,
      nigglingInjuryCount: 1,
    });
  });

  it('ignores a legacy named injury it does not model', () => {
    // Exactly one page carries one: pid 91's "Smashed Hip".
    expect(parser.parse('Smashed Hip DEATH!')).toEqual(CLEAN);
  });
});
