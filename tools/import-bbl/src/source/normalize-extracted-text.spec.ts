import { describe, expect, it } from 'vitest';

import { normalizeExtractedText } from './normalize-extracted-text';

describe('normalizeExtractedText', () => {
  it('collapses an internal non-breaking space to a plain space', () => {
    // U+00A0 between the two words, as cheerio decodes a `&nbsp;` entity.
    expect(normalizeExtractedText('Chaos Dwarf')).toBe('Chaos Dwarf');
  });

  it('collapses a run of mixed internal whitespace to a single space', () => {
    expect(normalizeExtractedText('Orc \t  Team')).toBe('Orc Team');
  });

  it('trims leading and trailing whitespace, including nbsp', () => {
    expect(normalizeExtractedText('   Goblin Team  \n')).toBe('Goblin Team');
  });

  it('returns an identical string when there is nothing to normalize', () => {
    expect(normalizeExtractedText('High Elf')).toBe('High Elf');
  });

  it('returns an empty string for an all-whitespace input', () => {
    expect(normalizeExtractedText('   \t\n ')).toBe('');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeExtractedText('')).toBe('');
  });
});
