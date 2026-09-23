import { ApiClientModule } from '@blood-bowl-tracker/api-client';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ImportTpLiveModule } from './import-tp-live.module';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import {
  TP_CONNECTION_PROVIDER,
  TP_ERA_RULES_SETS_PROVIDER,
  TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
} from './tp-import-providers';

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
    {
      provide: TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
      useValue: { getTpSystemName: () => 'TP' },
    },
    { provide: TP_ERA_RULES_SETS_PROVIDER, useValue: { getEras: () => [] } },
  ],
  exports: [
    TP_CONNECTION_PROVIDER,
    TP_EXTERNAL_SYSTEM_NAME_PROVIDER,
    TP_ERA_RULES_SETS_PROVIDER,
  ],
})
class TestTpProvidersModule {}

describe('ImportTpLiveModule', () => {
  it('composes TpLiveTeamImportService with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRoot({
          baseUrl: 'http://localhost:3000',
          apiToken: 'a-token',
        }),
        TestTpProvidersModule,
        ImportTpLiveModule,
      ],
    }).compile();

    expect(moduleRef.get(TpLiveTeamImportService)).toBeInstanceOf(
      TpLiveTeamImportService,
    );
  });
});
