import { describe, expect, it } from 'vitest';

import { NormalizeExtractedTextService } from './normalize-extracted-text.service';

describe('NormalizeExtractedTextService', () => {
  const service = new NormalizeExtractedTextService();

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
});
