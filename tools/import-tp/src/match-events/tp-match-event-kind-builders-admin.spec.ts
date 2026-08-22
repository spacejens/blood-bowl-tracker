import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import { TpAdminMatchEventBuilderService } from './tp-admin-match-event-builder.service';
import { TpMatchEventHelpersService } from './tp-match-event-helpers.service';
import { TpMatchEventKindBuildersService } from './tp-match-event-kind-builders.service';
import {
  buildOptions,
  MATCH_DB_ID,
  TP_SYSTEM_ID,
} from './tp-match-event-kind-builders.test-helpers';

/**
 * `TpMatchEventKindBuildersService.buildAdminEvents` is a one-line delegate
 * to `TpAdminMatchEventBuilderService.buildAdminEvents` — this spec verifies
 * only that delegation, with `TpAdminMatchEventBuilderService` mocked. The
 * actual admin-event assembly behavior it delegates to has its own dedicated
 * spec, `tp-admin-match-event-builder.service.spec.ts`, where that service is
 * the real provider under test. Gameplay events are covered in
 * `tp-match-event-kind-builders-gameplay.spec.ts`.
 */
describe('TpMatchEventKindBuildersService admin events', () => {
  let service: TpMatchEventKindBuildersService;
  let adminEventBuilder: MockProxy<TpAdminMatchEventBuilderService>;

  beforeEach(async () => {
    adminEventBuilder = mock<TpAdminMatchEventBuilderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchEventKindBuildersService,
        {
          provide: TpAdminMatchEventBuilderService,
          useValue: adminEventBuilder,
        },
        TpMatchEventHelpersService,
        { provide: ImportResultService, useValue: mockImportResultService() },
      ],
    }).compile();
    service = moduleRef.get(TpMatchEventKindBuildersService);
  });

  it('delegates to TpAdminMatchEventBuilderService.buildAdminEvents with the same options and returns its value', () => {
    const built: UpsertMatchEvent[] = [
      {
        matchId: MATCH_DB_ID,
        eventType: 'weather',
        weatherType: 'perfect_conditions',
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-10' }],
      },
    ];
    adminEventBuilder.buildAdminEvents.mockReturnValue(built);
    const options = buildOptions({
      event: {
        type: 'weather_roll',
        tpEventId: 10,
        instant: 'x',
        weatherType: 'perfect_conditions',
      },
    });

    expect(service.buildAdminEvents(options)).toBe(built);
    expect(adminEventBuilder.buildAdminEvents).toHaveBeenCalledWith(options);
  });
});
