import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';

const HOME_ROSTER_ID = 164868;
const AWAY_ROSTER_ID = 167242;

function casualty(options: {
  tpEventId: number;
  instant: string;
  lineUpId: number;
  rosterId: number;
  turnNumber?: number;
}): Extract<TpMatchEvent, { type: 'casualty_caused' }> {
  return { type: 'casualty_caused', ...options };
}

function injury(options: {
  tpEventId: number;
  instant: string;
  lineUpId: number;
  rosterId: number;
  turnRosterId?: number;
  turnNumber?: number;
}): Extract<TpMatchEvent, { type: 'injury' }> {
  return { type: 'injury', injuryType: 'MissNextGame', ...options };
}

describe('correlateCasualties', () => {
  let service: TpMatchEventsCorrelationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchEventsCorrelationService],
    }).compile();
    service = moduleRef.get(TpMatchEventsCorrelationService);
  });

  it('pairs a casualty with the injury sharing its turnNumber and direction', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:05Z',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.get(2)).toBe(casualtyEvent);
    expect(pairing.pairedCasualtyEventIds.has(1)).toBe(true);
  });

  it('does NOT pair across different turnNumbers even when close in time', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:01Z', // 1s later, but different turn
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 6,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
    expect(pairing.pairedCasualtyEventIds.size).toBe(0);
  });

  it('pairs even when the injury (code 8) instant is EARLIER than the casualty (code 6) instant', () => {
    // TP's registration is asynchronous: the injury roll can be logged
    // (and timestamped) before its causing casualty action.
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T17:59:00Z', // earlier than the casualty below
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    // Array order also has the injury appearing first, matching TP's
    // observed async registration behavior.
    const pairing = service.correlateCasualties([injuryEvent, casualtyEvent]);

    expect(pairing.casualtyByInjuryEventId.get(2)).toBe(casualtyEvent);
    expect(pairing.pairedCasualtyEventIds.has(1)).toBe(true);
  });

  it('consumes each code-8 by at most one code-6, picking the nearest-in-time candidate', () => {
    const casualtyA = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const casualtyB = casualty({
      tpEventId: 2,
      instant: '2026-01-17T18:00:10Z',
      lineUpId: 11,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    // Two same-turn, correct-direction injury candidates.
    const injuryNearA = injury({
      tpEventId: 3,
      instant: '2026-01-17T18:00:01Z',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryNearB = injury({
      tpEventId: 4,
      instant: '2026-01-17T18:00:09Z',
      lineUpId: 21,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([
      casualtyA,
      casualtyB,
      injuryNearA,
      injuryNearB,
    ]);

    // Each injury consumed by exactly one casualty, matched to its nearest.
    expect(pairing.casualtyByInjuryEventId.get(3)).toBe(casualtyA);
    expect(pairing.casualtyByInjuryEventId.get(4)).toBe(casualtyB);
    expect(pairing.casualtyByInjuryEventId.size).toBe(2);
    expect(pairing.pairedCasualtyEventIds.size).toBe(2);
  });

  it('leaves an unpaired casualty (no matching injury) unclaimed, with no crash', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
    expect(pairing.pairedCasualtyEventIds.size).toBe(0);
  });

  it('leaves an unpaired injury (no matching casualty) unclaimed, with no crash', () => {
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
    expect(pairing.pairedCasualtyEventIds.size).toBe(0);
  });

  it('does not pair a casualty with no turnNumber, even if a same-rosterId-direction injury exists', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      // turnNumber intentionally omitted (older event without it)
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:01Z',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      // turnNumber also omitted
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
  });

  it('does not pair when the injury is self-inflicted (turnRosterId equals the victim roster)', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:01Z',
      lineUpId: 20,
      rosterId: HOME_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID, // same side as victim: self-inflicted
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
  });

  it('does not pair when instant is not a parseable timestamp (cannot verify the cutoff)', () => {
    // A malformed/placeholder `instant` diffs to NaN, which is never `<=`
    // MAX_PAIRING_DELAY_MS — so an unmeasurable delta can no longer be
    // assumed to be within the 120s cutoff window. This is a deliberate
    // behavior change from the prior "always pair despite NaN" workaround:
    // without a measurable time delta we can't confirm the pairing is
    // actually within the window, so the casualty is left unpaired instead.
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: 'not-a-date',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: 'also-not-a-date',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
    expect(pairing.pairedCasualtyEventIds.size).toBe(0);
  });

  it('pairs a candidate exactly at the 120s cutoff boundary (diffMs === MAX_PAIRING_DELAY_MS)', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:02:00Z', // exactly 120,000ms later
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.get(2)).toBe(casualtyEvent);
    expect(pairing.pairedCasualtyEventIds.has(1)).toBe(true);
  });

  it('does not pair a candidate 1ms beyond the 120s cutoff, even as the sole candidate, and falls through to unpaired', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00.000Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:02:00.001Z', // 120,001ms later
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([casualtyEvent, injuryEvent]);

    // Even though this was the ONLY raw candidate (turnNumber + direction
    // match), it's beyond the cutoff, so the casualty stays unpaired —
    // confirming the cutoff can disqualify a single-candidate case too.
    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
    expect(pairing.pairedCasualtyEventIds.size).toBe(0);
  });

  it('picks the in-window candidate over an out-of-window one, even when the out-of-window one is iterated first', () => {
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    // Out-of-window candidate (121s away), listed FIRST so a naive loop
    // that doesn't filter before comparing "nearest so far" could
    // accidentally let it become `best` before the in-window one is seen.
    const injuryOutOfWindow = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:02:01Z', // 121s later, beyond cutoff
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryInWindow = injury({
      tpEventId: 3,
      instant: '2026-01-17T18:01:00Z', // 60s later, within cutoff
      lineUpId: 21,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([
      casualtyEvent,
      injuryOutOfWindow,
      injuryInWindow,
    ]);

    expect(pairing.casualtyByInjuryEventId.get(3)).toBe(casualtyEvent);
    expect(pairing.casualtyByInjuryEventId.has(2)).toBe(false);
    expect(pairing.casualtyByInjuryEventId.size).toBe(1);
  });

  it('ignores non-casualty/non-injury events mixed into the match', () => {
    const touchdown: TpMatchEvent = {
      type: 'touchdown',
      tpEventId: 99,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 30,
      rosterId: HOME_ROSTER_ID,
    };
    const casualtyEvent = casualty({
      tpEventId: 1,
      instant: '2026-01-17T18:00:00Z',
      lineUpId: 10,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });
    const injuryEvent = injury({
      tpEventId: 2,
      instant: '2026-01-17T18:00:01Z',
      lineUpId: 20,
      rosterId: AWAY_ROSTER_ID,
      turnRosterId: HOME_ROSTER_ID,
      turnNumber: 5,
    });

    const pairing = service.correlateCasualties([
      touchdown,
      casualtyEvent,
      injuryEvent,
    ]);

    expect(pairing.casualtyByInjuryEventId.get(2)).toBe(casualtyEvent);
  });
});
