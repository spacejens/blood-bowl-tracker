import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it } from 'vitest';

import { correlateCasualties } from './tp-match-events-correlation';

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

    const pairing = correlateCasualties([casualtyEvent, injuryEvent]);

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

    const pairing = correlateCasualties([casualtyEvent, injuryEvent]);

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
    const pairing = correlateCasualties([injuryEvent, casualtyEvent]);

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

    const pairing = correlateCasualties([
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

    const pairing = correlateCasualties([casualtyEvent]);

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

    const pairing = correlateCasualties([injuryEvent]);

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

    const pairing = correlateCasualties([casualtyEvent, injuryEvent]);

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

    const pairing = correlateCasualties([casualtyEvent, injuryEvent]);

    expect(pairing.casualtyByInjuryEventId.size).toBe(0);
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

    const pairing = correlateCasualties([
      touchdown,
      casualtyEvent,
      injuryEvent,
    ]);

    expect(pairing.casualtyByInjuryEventId.get(2)).toBe(casualtyEvent);
  });
});
