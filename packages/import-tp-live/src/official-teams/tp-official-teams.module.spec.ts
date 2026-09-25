import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { TpOfficialTeamsModule } from './tp-official-teams.module';
import { TpOfficialTeamsImportService } from './tp-official-teams-import.service';

/** Stands in for the app's `@Global()` DbModule. */
@Global()
@Module({
  providers: [{ provide: DB, useValue: mockDb().db }],
  exports: [DB],
})
class TestDbModule {}

describe('TpOfficialTeamsModule', () => {
  it('composes TpOfficialTeamsImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDbModule, TpOfficialTeamsModule],
    }).compile();

    expect(moduleRef.get(TpOfficialTeamsImportService)).toBeInstanceOf(
      TpOfficialTeamsImportService,
    );
  });
});
