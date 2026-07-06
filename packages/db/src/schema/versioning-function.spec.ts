import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pinned checksum of the unmodified upstream nearform/temporal_tables
// versioning_function.sql (v1.2.1). If this test fails after an
// intentional upgrade, update both the vendored file and this constant
// together in the same commit.
const EXPECTED_SHA256 =
  'e7e03b06b59544d584fdc82bbd1c93463adfd9ebbe68568f19cca52da211753c';

describe('vendored versioning function', () => {
  it('has not been modified from the vendored upstream copy', () => {
    const path = join(
      __dirname,
      '../../vendor/nearform/temporal_tables/versioning_function.sql',
    );
    const content = readFileSync(path);
    const actual = createHash('sha256').update(content).digest('hex');
    expect(actual).toBe(EXPECTED_SHA256);
  });
});
