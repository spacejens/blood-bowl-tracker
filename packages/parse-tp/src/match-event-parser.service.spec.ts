import { describe, expect, it } from 'vitest';

import { MatchEventParserService } from './match-event-parser.service';

const parser = new MatchEventParserService();

describe('MatchEventParserService', () => {
  it('decodes a touchdown (code 4)', () => {
    expect(
      parser.parse([
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

  it('decodes an MVP award (code 7)', () => {
    expect(
      parser.parse([
        {
          id: 7150378,
          matchEventType: 7,
          instant: '2026-01-17T18:54:42.4449189+00:00',
          lineUpId: 2442076,
          rosterId: 164868,
          extraData: { autoRoll: false },
          starPoints: 4,
          edited: false,
        },
      ]),
    ).toEqual([
      {
        type: 'mvp_award',
        tpEventId: 7150378,
        instant: '2026-01-17T18:54:42.4449189+00:00',
        lineUpId: 2442076,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes a completion (code 3)', () => {
    expect(
      parser.parse([
        {
          id: 7150320,
          matchEventType: 3,
          instant: '2026-01-17T18:49:00Z',
          lineUpId: 2442075,
          rosterId: 164868,
        },
      ]),
    ).toEqual([
      {
        type: 'completion',
        tpEventId: 7150320,
        instant: '2026-01-17T18:49:00Z',
        lineUpId: 2442075,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes an interception (code 5)', () => {
    expect(
      parser.parse([
        {
          id: 7150321,
          matchEventType: 5,
          instant: '2026-01-17T18:49:10Z',
          lineUpId: 2442076,
          rosterId: 167242,
        },
      ]),
    ).toEqual([
      {
        type: 'interception',
        tpEventId: 7150321,
        instant: '2026-01-17T18:49:10Z',
        lineUpId: 2442076,
        rosterId: 167242,
      },
    ]);
  });

  it('decodes a casualty caused (code 6)', () => {
    expect(
      parser.parse([
        {
          id: 7150322,
          matchEventType: 6,
          instant: '2026-01-17T18:49:20Z',
          lineUpId: 2442077,
          rosterId: 164868,
        },
      ]),
    ).toEqual([
      {
        type: 'casualty_caused',
        tpEventId: 7150322,
        instant: '2026-01-17T18:49:20Z',
        lineUpId: 2442077,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes a deflection (code 25)', () => {
    expect(
      parser.parse([
        {
          id: 7150323,
          matchEventType: 25,
          instant: '2026-01-17T18:49:30Z',
          lineUpId: 2442078,
          rosterId: 167242,
        },
      ]),
    ).toEqual([
      {
        type: 'deflection',
        tpEventId: 7150323,
        instant: '2026-01-17T18:49:30Z',
        lineUpId: 2442078,
        rosterId: 167242,
      },
    ]);
  });

  it('decodes a foul (code 31)', () => {
    expect(
      parser.parse([
        {
          id: 7150324,
          matchEventType: 31,
          instant: '2026-01-17T18:49:40Z',
          lineUpId: 2442079,
          rosterId: 164868,
        },
      ]),
    ).toEqual([
      {
        type: 'foul',
        tpEventId: 7150324,
        instant: '2026-01-17T18:49:40Z',
        lineUpId: 2442079,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes a sent off (code 32)', () => {
    expect(
      parser.parse([
        {
          id: 7150325,
          matchEventType: 32,
          instant: '2026-01-17T18:49:50Z',
          lineUpId: 2442079,
          rosterId: 164868,
        },
      ]),
    ).toEqual([
      {
        type: 'sent_off',
        tpEventId: 7150325,
        instant: '2026-01-17T18:49:50Z',
        lineUpId: 2442079,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes a successful landing (code 46)', () => {
    expect(
      parser.parse([
        {
          id: 7150326,
          matchEventType: 46,
          instant: '2026-01-17T18:50:00Z',
          lineUpId: 2442075,
          rosterId: 164868,
        },
      ]),
    ).toEqual([
      {
        type: 'successful_landing',
        tpEventId: 7150326,
        instant: '2026-01-17T18:50:00Z',
        lineUpId: 2442075,
        rosterId: 164868,
      },
    ]);
  });

  it('decodes an injury (code 8) with its injuryType and acting team', () => {
    expect(
      parser.parse([
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

  it('decodes an injury (code 8) with its turnNumber, when present', () => {
    const [event] = parser.parse([
      {
        id: 7150231,
        matchEventType: 8,
        instant: '2026-01-17T18:44:30.335919+00:00',
        lineUpId: 2442083,
        rosterId: 164868,
        turnRosterId: 168446,
        turnNumber: 14,
        injuryType: 'None',
        extraData: {
          roll1: 4,
          roll2: 0,
          injuryType: 'None',
          nigglingInjuries: 0,
          decay: false,
        },
      },
    ]);
    expect(event).toEqual({
      type: 'injury',
      tpEventId: 7150231,
      instant: '2026-01-17T18:44:30.335919+00:00',
      lineUpId: 2442083,
      rosterId: 164868,
      turnRosterId: 168446,
      turnNumber: 14,
      injuryType: 'None',
    });
  });

  it('decodes a casualty caused (code 6) with its turnNumber, when present', () => {
    const [event] = parser.parse([
      {
        id: 7150224,
        matchEventType: 6,
        instant: '2026-01-17T18:44:15.5783948+00:00',
        lineUpId: 2565349,
        rosterId: 168446,
        starPoints: 3,
        turnNumber: 14,
      },
    ]);
    expect(event).toEqual({
      type: 'casualty_caused',
      tpEventId: 7150224,
      instant: '2026-01-17T18:44:15.5783948+00:00',
      lineUpId: 2565349,
      rosterId: 168446,
      turnNumber: 14,
    });
  });

  it('decodes a weather roll (code 10)', () => {
    expect(
      parser.parse([
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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

  it('decodes an inducements roll (code 11) with a fromTreasury amount', () => {
    const [event] = parser.parse([
      {
        id: 22,
        matchEventType: 11,
        instant: '2026-01-17T09:07:04Z',
        rosterId: 168304,
        extraData: { totalCost: 80, starPlayers: [], fromTreasury: 50 },
      },
    ]);
    expect(event).toEqual({
      type: 'inducements_roll',
      tpEventId: 22,
      instant: '2026-01-17T09:07:04Z',
      rosterId: 168304,
      totalCost: 80,
      starPlayers: [],
      fromTreasury: 50,
    });
  });

  it('decodes an inducements roll (code 11) without a fromTreasury amount (omits the optional field)', () => {
    const [event] = parser.parse([
      {
        id: 23,
        matchEventType: 11,
        instant: '2026-01-17T09:07:04Z',
        rosterId: 168304,
        extraData: { totalCost: 20, starPlayers: [] },
      },
    ]);
    expect(event).not.toHaveProperty('fromTreasury');
  });

  it('decodes a winnings roll (code 12)', () => {
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
      expensiveMistake: 20000,
    });
  });

  it('decodes a journeyman signing (code 15)', () => {
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
      parser.parse([
        { id: 3, matchEventType: 0, instant: 'x', extraData: {} },
        { id: 4, matchEventType: 1, instant: 'x' },
        { id: 5, matchEventType: 18, instant: 'x', lineUpId: 1, rosterId: 2 },
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
    const [event] = parser.parse([
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
    const [event] = parser.parse([
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
      parser.parse([
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
    expect(() => parser.parse({ not: 'an array' })).toThrow();
  });

  it('returns an empty array for an empty input', () => {
    expect(parser.parse([])).toEqual([]);
  });

  it('drops entries with no numeric matchEventType', () => {
    expect(parser.parse([{ id: 40, instant: 'x' }])).toEqual([]);
  });
});
