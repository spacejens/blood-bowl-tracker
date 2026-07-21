import { describe, expect, it } from 'vitest';

import { parseMatchEvents } from './match-event-parser.service';

describe('parseMatchEvents', () => {
  it('decodes a touchdown (code 4)', () => {
    expect(
      parseMatchEvents([
        {
          id: 7150327,
          matchEventType: 4,
          instant: '2026-01-17T18:50:14Z',
          lineUpId: 2442075,
          rosterId: 164868,
          extraData: { scoreLocal: 1, scoreVisitor: 1 },
        },
      ]),
    ).toEqual([
      {
        type: 'touchdown',
        tpEventId: 7150327,
        instant: '2026-01-17T18:50:14Z',
        lineUpId: 2442075,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes an injury (code 8) with its injuryType and acting team', () => {
    expect(
      parseMatchEvents([
        {
          id: 7147568,
          matchEventType: 8,
          instant: '2026-01-17T16:32:44Z',
          lineUpId: 2459782,
          rosterId: 167242,
          turnRosterId: 168304,
          injuryType: 'Dead',
          extraData: {
            roll1: 15,
            roll2: 0,
            injuryType: 'Dead',
            nigglingInjuries: 1,
            decay: false,
          },
        },
      ]),
    ).toEqual([
      {
        type: 'injury',
        tpEventId: 7147568,
        instant: '2026-01-17T16:32:44Z',
        lineUpId: 2459782,
        rosterId: 167242,
        turnRosterId: 168304,
        injuryType: 'Dead',
      },
    ]);
  });

  it('decodes a weather roll (code 10)', () => {
    expect(
      parseMatchEvents([
        {
          id: 1,
          matchEventType: 10,
          instant: '2026-01-17T17:56:05Z',
          extraData: { weatherType: 104, weatherTable: 0 },
        },
      ]),
    ).toEqual([
      {
        type: 'weather_roll',
        tpEventId: 1,
        instant: '2026-01-17T17:56:05Z',
        weatherType: 104,
      },
    ]);
  });

  it('decodes an inducements roll (code 11) with induced star players', () => {
    const [event] = parseMatchEvents([
      {
        id: 2,
        matchEventType: 11,
        instant: '2026-01-17T16:27:41Z',
        rosterId: 168446,
        extraData: {
          totalCost: 80,
          starPlayers: [
            {
              name: 'Fungus the Loon',
              lineUpMasterId: 1122,
              number: 11,
              isStarPlayer: true,
            },
          ],
        },
      },
    ]);
    expect(event).toEqual({
      type: 'inducements_roll',
      tpEventId: 2,
      instant: '2026-01-17T16:27:41Z',
      rosterId: 168446,
      totalCost: 80,
      starPlayers: [
        { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
      ],
    });
  });

  it('decodes an inducements roll (code 11) with no star players', () => {
    const [event] = parseMatchEvents([
      {
        id: 21,
        matchEventType: 11,
        instant: '2026-01-17T09:07:04Z',
        rosterId: 168304,
        extraData: { totalCost: 20, starPlayers: [] },
      },
    ]);
    expect(event).toEqual({
      type: 'inducements_roll',
      tpEventId: 21,
      instant: '2026-01-17T09:07:04Z',
      rosterId: 168304,
      totalCost: 20,
      starPlayers: [],
    });
  });

  it('decodes a winnings roll (code 12)', () => {
    const [event] = parseMatchEvents([
      {
        id: 30,
        matchEventType: 12,
        instant: '2026-01-17T11:43:26Z',
        extraData: {
          localWinnings: 60000,
          bonusLocalWinnings: 0,
          visitorWinnings: 70000,
          bonusVisitorWinnings: 0,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'winnings_roll',
      tpEventId: 30,
      instant: '2026-01-17T11:43:26Z',
      localWinnings: 60000,
      visitorWinnings: 70000,
    });
  });

  it('decodes a fan factor roll (code 13)', () => {
    const [event] = parseMatchEvents([
      {
        id: 31,
        matchEventType: 13,
        instant: '2026-01-17T09:02:20Z',
        extraData: {
          newFanFactorLocal: 0,
          fanFactorModifierLocal: 0,
          newFanFactorVisitor: 0,
          fanFactorModifierVisitor: 0,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'fan_factor_roll',
      tpEventId: 31,
      instant: '2026-01-17T09:02:20Z',
      newFanFactorLocal: 0,
      newFanFactorVisitor: 0,
    });
  });

  it('decodes an expensive mistake (code 14)', () => {
    const [event] = parseMatchEvents([
      {
        id: 32,
        matchEventType: 14,
        instant: '2026-01-17T12:42:25Z',
        rosterId: 167599,
        extraData: {
          roll: 2,
          rollTreasury: 2,
          totalCost: 20000,
          expensiveMistake: 2,
          originalTreasury: 320000,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'expensive_mistake',
      tpEventId: 32,
      instant: '2026-01-17T12:42:25Z',
      rosterId: 167599,
      expensiveMistake: 2,
    });
  });

  it('decodes a journeyman signing (code 15)', () => {
    const [event] = parseMatchEvents([
      {
        id: 33,
        matchEventType: 15,
        instant: '2026-01-17T12:42:31Z',
        rosterId: 164868,
        extraData: {
          journeymenCount: 1,
          name: 'Journeyman',
          position: 'Dwarf Lineman',
        },
      },
    ]);
    expect(event).toEqual({
      type: 'journeyman_signing',
      tpEventId: 33,
      instant: '2026-01-17T12:42:31Z',
      rosterId: 164868,
      journeymenCount: 1,
    });
  });

  it('decodes a concession (code 20)', () => {
    const [event] = parseMatchEvents([
      {
        id: 34,
        matchEventType: 20,
        instant: '2025-04-09T17:05:15Z',
        extraData: {
          noPoints: false,
          concedeLocal: false,
          concedeVisitor: true,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'concession',
      tpEventId: 34,
      instant: '2025-04-09T17:05:15Z',
      concedeLocal: false,
      concedeVisitor: true,
    });
  });

  it('decodes a prayers to Nuffle roll (code 23)', () => {
    const [event] = parseMatchEvents([
      {
        id: 35,
        matchEventType: 23,
        instant: '2023-09-19T06:48:48Z',
        rosterId: 40158,
        extraData: {
          prayersToNuffle: 2,
          underdogValue: 100,
          localRosterValue: 1365,
          visitorRosterValue: 1265,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'prayers_to_nuffle',
      tpEventId: 35,
      instant: '2023-09-19T06:48:48Z',
      prayersToNuffle: 2,
    });
  });

  it('decodes a dedicated fans roll (code 26)', () => {
    const [event] = parseMatchEvents([
      {
        id: 36,
        matchEventType: 26,
        instant: '2026-01-17T11:43:33Z',
        extraData: {
          dedicatedFansModifierLocal: -1,
          dedicatedFansModifierVisitor: 0,
          previousDedicatedFansLocal: 3,
          previousDedicatedFansVisitor: 3,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'dedicated_fans_roll',
      tpEventId: 36,
      instant: '2026-01-17T11:43:33Z',
      dedicatedFansModifierLocal: -1,
      dedicatedFansModifierVisitor: 0,
    });
  });

  it('decodes a secret objective (code 42)', () => {
    const [event] = parseMatchEvents([
      {
        id: 37,
        matchEventType: 42,
        instant: '2024-07-09T16:09:45Z',
        rosterId: 60677,
        extraData: { secretObjective: 12 },
      },
    ]);
    expect(event).toEqual({
      type: 'secret_objective',
      tpEventId: 37,
      instant: '2024-07-09T16:09:45Z',
      rosterId: 60677,
      secretObjective: 12,
    });
  });

  it('drops skip-listed and unknown codes', () => {
    expect(
      parseMatchEvents([
        { id: 3, matchEventType: 0, instant: 'x', extraData: {} },
        { id: 4, matchEventType: 1, instant: 'x' },
        { id: 5, matchEventType: 6, instant: 'x', lineUpId: 1, rosterId: 2 },
        { id: 6, matchEventType: 999, instant: 'x' },
        // Code 27 is a structural "player assigned" row, not a modeled event.
        {
          id: 38,
          lineUpId: 681825,
          matchEventType: 27,
          instant: 'x',
          rosterId: 24070,
          extraData: {
            name: 'Hamilton Hamilcar',
            position: 'Rotter Lineman',
            number: 17,
          },
        },
      ]),
    ).toEqual([]);
  });

  it('returns None injuries (the import step decides to skip them)', () => {
    const [event] = parseMatchEvents([
      {
        id: 7,
        matchEventType: 8,
        instant: 'x',
        lineUpId: 1,
        rosterId: 2,
        injuryType: 'None',
        extraData: {
          injuryType: 'None',
          roll1: 4,
          roll2: 0,
          nigglingInjuries: 0,
          decay: false,
        },
      },
    ]);
    expect(event.type).toBe('injury');
    if (event.type === 'injury') {
      expect(event.injuryType).toBe('None');
    }
  });

  it('decodes an injury without a turnRosterId (omits the optional field)', () => {
    const [event] = parseMatchEvents([
      {
        id: 8,
        matchEventType: 8,
        instant: 'x',
        lineUpId: 1,
        rosterId: 2,
        injuryType: 'NigglingInjury',
        extraData: {
          injuryType: 'NigglingInjury',
          roll1: 4,
          roll2: 0,
          nigglingInjuries: 1,
          decay: false,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'injury',
      tpEventId: 8,
      instant: 'x',
      lineUpId: 1,
      rosterId: 2,
      injuryType: 'NigglingInjury',
    });
  });

  it('throws a descriptive Error when a known code has an invalid payload', () => {
    expect(() =>
      parseMatchEvents([
        {
          id: 9,
          matchEventType: 4,
          instant: 'x',
          lineUpId: 1 /* missing rosterId */,
        },
      ]),
    ).toThrow(/rosterId/);
  });

  it('throws when the input is not an array', () => {
    expect(() => parseMatchEvents({ not: 'an array' })).toThrow();
  });

  it('returns an empty array for an empty input', () => {
    expect(parseMatchEvents([])).toEqual([]);
  });

  it('drops entries with no numeric matchEventType', () => {
    expect(parseMatchEvents([{ id: 40, instant: 'x' }])).toEqual([]);
  });
});
