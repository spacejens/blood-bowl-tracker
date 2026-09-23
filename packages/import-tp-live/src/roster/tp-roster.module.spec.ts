import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { TpRosterModule } from './tp-roster.module';
import { TpRosterImportService } from './tp-roster-import.service';

/** Stands in for the app's `@Global()` DbModule. */
@Global()
@Module({
  providers: [{ provide: DB, useValue: mockDb().db }],
  exports: [DB],
})
class TestDbModule {}

describe('TpRosterModule', () => {
  it('composes TpRosterImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestDbModule, TpRosterModule],
    }).compile();

    expect(moduleRef.get(TpRosterImportService)).toBeInstanceOf(
      TpRosterImportService,
    );
  });
});
