import { describe, expect, it } from 'vitest';

import {
  browserGroupSchema,
  configFileSchema,
  connectionGroupSchema,
  downloadGroupSchema,
  rulesSetsSchema,
  tournamentsSchema,
} from './download-tp-config.schema';

describe('configFileSchema', () => {
  it('keeps an object config as-is', () => {
    expect(configFileSchema.parse({ download: { tournaments: [] } })).toEqual({
      download: { tournaments: [] },
    });
  });

  it('turns anything that is not an object into an empty config', () => {
    expect(configFileSchema.parse(undefined)).toEqual({});
    expect(configFileSchema.parse(null)).toEqual({});
    expect(configFileSchema.parse('nope')).toEqual({});
    expect(configFileSchema.parse(7)).toEqual({});
  });
});

describe('connectionGroupSchema', () => {
  it('reads both urls', () => {
    const parsed = connectionGroupSchema.parse({
      frontendUrl: 'https://tourplay.net/en/blood-bowl/',
      backendApiUrl: 'https://tourplay.net/api/',
    });
    expect(parsed.frontendUrl).toBe('https://tourplay.net/en/blood-bowl/');
    expect(parsed.backendApiUrl).toBe('https://tourplay.net/api/');
  });

  it('treats an empty or non-string url as unset', () => {
    const parsed = connectionGroupSchema.parse({
      frontendUrl: '',
      backendApiUrl: 7,
    });
    expect(parsed.frontendUrl).toBeUndefined();
    expect(parsed.backendApiUrl).toBeUndefined();
  });

  it('fails only when the group is not an object', () => {
    expect(connectionGroupSchema.safeParse({}).success).toBe(true);
    expect(connectionGroupSchema.safeParse(undefined).success).toBe(false);
    expect(connectionGroupSchema.safeParse('nope').success).toBe(false);
  });
});

describe('browserGroupSchema', () => {
  it('reads an explicit headless true', () => {
    expect(browserGroupSchema.parse({ headless: true }).headless).toBe(true);
  });

  it('treats anything else as not headless', () => {
    expect(
      browserGroupSchema.parse({ headless: 'yes' }).headless,
    ).toBeUndefined();
    expect(browserGroupSchema.parse({}).headless).toBeUndefined();
  });

  it('fails when the group is not an object', () => {
    expect(browserGroupSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('downloadGroupSchema and tournamentsSchema', () => {
  it('accepts a present download group', () => {
    expect(downloadGroupSchema.safeParse({}).success).toBe(true);
    expect(downloadGroupSchema.safeParse(undefined).success).toBe(false);
  });

  it('accepts a non-empty list of tournament names', () => {
    expect(tournamentsSchema.parse(['tloegbbl-sasong-30'])).toEqual([
      'tloegbbl-sasong-30',
    ]);
  });

  it('rejects a non-array, a blank name, and non-strings', () => {
    expect(tournamentsSchema.safeParse('a').success).toBe(false);
    expect(tournamentsSchema.safeParse(['']).success).toBe(false);
    expect(tournamentsSchema.safeParse([1]).success).toBe(false);
  });
});

describe('tournamentsSchema', () => {
  it('accepts an empty array, so "official data only" is a valid config', () => {
    expect(tournamentsSchema.parse([])).toEqual([]);
  });

  it('still rejects a non-array and an array with a blank name', () => {
    expect(tournamentsSchema.safeParse('season-30').success).toBe(false);
    expect(tournamentsSchema.safeParse(['']).success).toBe(false);
  });
});

describe('rulesSetsSchema', () => {
  it('reads a non-empty list of rules set names', () => {
    expect(rulesSetsSchema.parse(['BB2020', 'BB2025'])).toEqual([
      'BB2020',
      'BB2025',
    ]);
  });

  it('rejects an empty array, a blank name and a non-array', () => {
    expect(rulesSetsSchema.safeParse([]).success).toBe(false);
    expect(rulesSetsSchema.safeParse(['']).success).toBe(false);
    expect(rulesSetsSchema.safeParse('BB2020').success).toBe(false);
  });
});
