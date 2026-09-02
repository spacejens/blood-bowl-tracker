import { describe, expect, it } from 'vitest';

import {
  GITIGNORED_AUTO_CREATE_SYMLINK_DIRS,
  GITIGNORED_DATA_DIRS,
  GITIGNORED_DRIFT_FILES,
  GITIGNORED_SYNC_FILES,
} from './gitignored-files';

describe('gitignored-files constants', () => {
  it('exports GITIGNORED_SYNC_FILES as a readonly array', () => {
    expect(GITIGNORED_SYNC_FILES).toEqual([
      'apps/discord-bot/.env',
      'tools/download-tp/download-tp-config.json5',
      'tools/import-bbl/import-bbl-config.json5',
      'tools/import-tp/import-tp-config.json5',
      'tools/import-manual/import-manual-config.json5',
      'tools/review-match/review-match-config.json5',
      'tools/review-player/review-player-config.json5',
      'tools/review-race/review-race-config.json5',
    ]);
  });

  it('exports GITIGNORED_DRIFT_FILES as a readonly array including sync files', () => {
    expect(GITIGNORED_DRIFT_FILES).toContainEqual('apps/discord-bot/.env');
    expect(GITIGNORED_DRIFT_FILES).toContainEqual(
      'apps/discord-bot/.env.production',
    );
    expect(GITIGNORED_DRIFT_FILES).toContainEqual(
      'tools/import-bbl/import-bbl-config.production.json5',
    );
  });

  it('exports GITIGNORED_DATA_DIRS as a readonly array', () => {
    expect(GITIGNORED_DATA_DIRS).toEqual([
      'tools/import-bbl/data',
      'tools/import-tp/data',
    ]);
  });

  it('exports GITIGNORED_AUTO_CREATE_SYMLINK_DIRS as a readonly array', () => {
    expect(GITIGNORED_AUTO_CREATE_SYMLINK_DIRS).toEqual(['docs/plans']);
  });
});
