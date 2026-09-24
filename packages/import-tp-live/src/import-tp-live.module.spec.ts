import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ImportTpLiveModule } from './import-tp-live.module';
import { TpLiveMatchImportService } from './live/tp-live-match-import.service';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import { TP_CONNECTION_PROVIDER } from './tp-import-providers';

/** Stands in for the app-owned `@Global()` module that supplies the tokens. */
@Global()
@Module({
  providers: [
    {
      provide: TP_CONNECTION_PROVIDER,
      useValue: {
        getBackendApiUrl: () => 'https://tp.example/api/',
        getFrontendUrl: () => 'https://tp.example/blood-bowl/',
      },
    },
    { provide: DB, useValue: mockDb().db },
  ],
  exports: [TP_CONNECTION_PROVIDER, DB],
})
class TestTpProvidersModule {}

describe('ImportTpLiveModule', () => {
  it('composes TpLiveTeamImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestTpProvidersModule, ImportTpLiveModule],
    }).compile();

    expect(moduleRef.get(TpLiveTeamImportService)).toBeInstanceOf(
      TpLiveTeamImportService,
    );
  });

  it('composes TpLiveMatchImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestTpProvidersModule, ImportTpLiveModule],
    }).compile();

    expect(moduleRef.get(TpLiveMatchImportService)).toBeInstanceOf(
      TpLiveMatchImportService,
    );
  });
});
