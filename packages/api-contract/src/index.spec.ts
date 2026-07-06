import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as indexModule from './index';

const schemasDir = join(__dirname, 'schemas');
const schemaFiles = readdirSync(schemasDir).filter((file) =>
  file.endsWith('.ts'),
);

describe('index', () => {
  it.each(schemaFiles)(
    're-exports everything from schemas/%s',
    async (file) => {
      const schemaModule = (await import(
        `./schemas/${file.replace(/\.ts$/, '')}`
      )) as Record<string, unknown>;

      for (const [exportName, exportValue] of Object.entries(schemaModule)) {
        expect(indexModule).toHaveProperty(exportName);
        expect((indexModule as Record<string, unknown>)[exportName]).toBe(
          exportValue,
        );
      }
    },
  );
});
