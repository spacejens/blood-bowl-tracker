import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchEventsImportedService } from './tp-match-events-imported.service';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const events: ImportResult = { success: true, imported: 14, errors: [] };
const failed: ImportResult = {
  success: false,
  imported: 0,
  errors: [{ item: 1, message: 'broken' }],
};

describe('TpMatchEventsImportedService', () => {
  let service: TpMatchEventsImportedService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchEventsImportedService],
    }).compile();
    service = moduleRef.get(TpMatchEventsImportedService);
  });

  it('holds when the match row was written, participation linked and events had no errors', () => {
    expect(
      service.eventsImported({ match: one, participation: one, events }),
    ).toBe(true);
  });

  it('holds for a match with no events at all, once written and linked', () => {
    expect(
      service.eventsImported({
        match: one,
        participation: one,
        events: nothing,
      }),
    ).toBe(true);
  });

  it('does not hold when the match row was not written', () => {
    expect(
      service.eventsImported({ match: nothing, participation: one, events }),
    ).toBe(false);
  });

  it('does not hold when participation was not linked', () => {
    expect(
      service.eventsImported({
        match: one,
        participation: failed,
        events: nothing,
      }),
    ).toBe(false);
    expect(
      service.eventsImported({
        match: one,
        participation: nothing,
        events: nothing,
      }),
    ).toBe(false);
  });

  it('does not hold when the events stage has errors', () => {
    expect(
      service.eventsImported({
        match: one,
        participation: one,
        events: failed,
      }),
    ).toBe(false);
  });
});
