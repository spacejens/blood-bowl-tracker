import { describe, expect, it } from 'vitest';

import { productionConfigSchema } from './production-config.schema';

describe('productionConfigSchema', () => {
  it('reads connection.apiBaseUrl', () => {
    expect(
      productionConfigSchema.parse({
        connection: { apiBaseUrl: 'http://localhost:3000' },
      }).connection?.apiBaseUrl,
    ).toBe('http://localhost:3000');
  });

  it('keeps an empty apiBaseUrl as an empty string', () => {
    expect(
      productionConfigSchema.parse({ connection: { apiBaseUrl: '' } })
        .connection?.apiBaseUrl,
    ).toBe('');
  });

  it('yields undefined for a config with no connection group', () => {
    expect(productionConfigSchema.parse({}).connection).toBeUndefined();
  });

  it('yields undefined for a non-object connection group', () => {
    expect(
      productionConfigSchema.parse({ connection: 'nope' }).connection
        ?.apiBaseUrl,
    ).toBeUndefined();
  });

  it('yields undefined for a non-string apiBaseUrl', () => {
    expect(
      productionConfigSchema.parse({ connection: { apiBaseUrl: 3000 } })
        .connection?.apiBaseUrl,
    ).toBeUndefined();
  });

  it('never throws for a non-object file', () => {
    expect(productionConfigSchema.parse('nope').connection).toBeUndefined();
    expect(productionConfigSchema.parse(null).connection).toBeUndefined();
  });
});
