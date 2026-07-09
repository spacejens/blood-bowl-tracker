import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Pinned checksum of the unmodified upstream nearform/temporal_tables
// LICENSE file. If this test fails after an intentional upgrade, update
// both the vendored file and this constant together in the same commit.
const EXPECTED_SHA256 =
  '604200e80ea78214b31a927a825b28dab51a0da614e37dabdaee4350146a1744';

describe('vendored temporal_tables LICENSE', () => {
  it('has not been modified from the vendored upstream copy', () => {
    const path = join(
      __dirname,
      '../../vendor/nearform/temporal_tables/LICENSE',
    );
    const content = readFileSync(path);
    const actual = createHash('sha256').update(content).digest('hex');
    expect(actual).toBe(EXPECTED_SHA256);
  });
});
