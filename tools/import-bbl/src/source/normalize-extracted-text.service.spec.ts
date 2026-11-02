import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NormalizeExtractedTextService } from './normalize-extracted-text.service';

describe('NormalizeExtractedTextService', () => {
  let service: NormalizeExtractedTextService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NormalizeExtractedTextService],
    }).compile();
    service = moduleRef.get(NormalizeExtractedTextService);
  });

  it('collapses an internal non-breaking space to a plain space', () => {
    // U+00A0 between the two words, as cheerio decodes a `&nbsp;` entity.
    expect(service.normalize('Chaos Dwarf')).toBe('Chaos Dwarf');
  });

  it('collapses a run of mixed internal whitespace to a single space', () => {
    expect(service.normalize('Orc \t  Team')).toBe('Orc Team');
  });

  it('trims leading and trailing whitespace, including nbsp', () => {
    expect(service.normalize('   Goblin Team  \n')).toBe('Goblin Team');
  });

  it('returns an identical string when there is nothing to normalize', () => {
    expect(service.normalize('High Elf')).toBe('High Elf');
  });

  it('returns an empty string for an all-whitespace input', () => {
    expect(service.normalize('   \t\n ')).toBe('');
  });

  it('returns an empty string for an empty input', () => {
    expect(service.normalize('')).toBe('');
  });

  it.each([
    ['U+2018', '‘'],
    ['U+2019', '’'],
    ['U+201A', '‚'],
    ['U+201B', '‛'],
  ])('folds the curly single quote %s to an apostrophe', (_label, quote) => {
    expect(service.normalize(`Ogre${quote}s Den`)).toBe("Ogre's Den");
  });

  it.each([
    ['U+201C', '“'],
    ['U+201D', '”'],
    ['U+201E', '„'],
    ['U+201F', '‟'],
  ])('folds the curly double quote %s to a straight one', (_label, quote) => {
    expect(service.normalize(`Bob ${quote}Nasty${quote} Nash`)).toBe(
      'Bob "Nasty" Nash',
    );
  });

  it('folds the apostrophe in a real BBL team name', () => {
    expect(service.normalize('Doctor Sydow’s Mistakes')).toBe(
      "Doctor Sydow's Mistakes",
    );
  });

  it('folds quotes and collapses whitespace in the same value', () => {
    expect(service.normalize(' ”Bomber”  Dick-Wick Jr ')).toBe(
      '"Bomber" Dick-Wick Jr',
    );
  });

  it('leaves en dashes, em dashes and ellipses as they are', () => {
    const text = 'Ogretoberfest – Bash — Favoured of …';

    expect(service.normalize(text)).toBe(text);
  });

  it('leaves straight quotes as they are', () => {
    const text = `Bryce "The Slice" Cambuel's`;

    expect(service.normalize(text)).toBe(text);
  });
});
