import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { TpCompetitionModule } from './tp-competition.module';
import { TpCompetitionImportService } from './tp-competition-import.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

/** Stands in for the app's `@Global()` DbModule. */
@Global()
@Module({
  providers: [{ provide: DB, useValue: mockDb().db }],
  exports: [DB],
})
class TestDbModule {}

describe('TpCompetitionModule', () => {
  it('composes TpCompetitionUpsertService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDbModule, TpCompetitionModule],
    }).compile();

    expect(moduleRef.get(TpCompetitionUpsertService)).toBeInstanceOf(
      TpCompetitionUpsertService,
    );
  });

  it('composes TpCompetitionImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDbModule, TpCompetitionModule],
    }).compile();

    expect(moduleRef.get(TpCompetitionImportService)).toBeInstanceOf(
      TpCompetitionImportService,
    );
  });
});
