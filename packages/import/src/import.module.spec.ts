import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT, ApiClientModule } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { BatchBufferService } from './batch-buffer.service';
import { CoachesImportService } from './coaches-import.service';
import { CompetitionsImportService } from './competitions-import.service';
import { ErasImportService } from './eras-import.service';
import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportModule } from './import.module';
import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';
import { MatchEventsImportService } from './match-events-import.service';
import { MatchOutcomesImportService } from './match-outcomes-import.service';
import { MatchesImportService } from './matches-import.service';
import { NameExternalIdService } from './name-external-id.service';
import { PlayersImportService } from './players-import.service';
import { PositionsImportService } from './positions-import.service';
import { RacesImportService } from './races-import.service';
import { RulesSetsImportService } from './rules-sets-import.service';
import { TeamsImportService } from './teams-import.service';

const providers = [
  ImportRunnerService,
  ImportResultService,
  BatchBufferService,
  CoachesImportService,
  CompetitionsImportService,
  LeaguesImportService,
  MatchEventsImportService,
  MatchOutcomesImportService,
  MatchesImportService,
  NameExternalIdService,
  PlayersImportService,
  PositionsImportService,
  RacesImportService,
  ExternalSystemsImportService,
  ExternalSystemBootstrapService,
  RulesSetsImportService,
  ErasImportService,
  TeamsImportService,
];

describe('ImportModule', () => {
  it('composes every exported service with its real dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiClientModule.forRoot({
          baseUrl: 'http://localhost:3000',
          apiToken: 'a-token',
        }),
        ImportModule,
      ],
    })
      .overrideProvider(API_CLIENT)
      .useValue(mockDeep<ApiClient>())
      .compile();

    for (const provider of providers) {
      expect(moduleRef.get(provider)).toBeInstanceOf(provider);
    }
  });
});
