import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { Decoder } from './match-event.types';
import { MatchEventDecodersService } from './match-event-decoders.service';
import { SecretObjectiveService } from './secret-objective.service';
import { WeatherTypeService } from './weather-type.service';

/**
 * Covers the actual decode/validation behavior `MatchEventParserService`
 * merely dispatches to: per-event-code schema validation, error messages on
 * an invalid payload, and conditional/optional field mapping. Per-code name
 * mapping tables (`weatherTypeByTableAndCode`/`secretObjectiveByCode`) are
 * fully covered by `WeatherTypeService`'s and `SecretObjectiveService`'s own
 * specs;
 * here `weatherType`/`secretObjective` are mocked so this spec only asserts
 * that the code-10/code-42 decoders delegate to them correctly.
 */
describe('MatchEventDecodersService', () => {
  let service: MatchEventDecodersService;
  let secretObjective: MockProxy<SecretObjectiveService>;
  let weatherType: MockProxy<WeatherTypeService>;
  let decoders: Map<number, Decoder>;

  beforeEach(async () => {
    secretObjective = mock<SecretObjectiveService>();
    weatherType = mock<WeatherTypeService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchEventDecodersService,
        { provide: SecretObjectiveService, useValue: secretObjective },
        { provide: WeatherTypeService, useValue: weatherType },
      ],
    }).compile();
    service = moduleRef.get(MatchEventDecodersService);
    decoders = service.build();
  });

  function decode(code: number, raw: unknown) {
    const decoder = decoders.get(code);
    if (!decoder) {
      throw new Error(`No decoder registered for code ${code}`);
    }
    return decoder(raw);
  }

  it('registers exactly the known codes', () => {
    expect([...decoders.keys()].sort((a, b) => a - b)).toEqual([
      3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 20, 23, 25, 26, 31, 32, 42, 45,
      46, 47,
    ]);
  });

  it('decodes a completion (code 3)', () => {
    expect(
      decode(3, {
        id: 7150320,
        instant: '2026-01-17T18:49:00Z',
        lineUpId: 2442075,
        rosterId: 164868,
        starPoints: 1,
      }),
    ).toEqual({
      type: 'completion',
      tpEventId: 7150320,
      instant: '2026-01-17T18:49:00Z',
      lineUpId: 2442075,
      rosterId: 164868,
      starPoints: 1,
    });
  });

  it('decodes a touchdown (code 4)', () => {
    expect(
      decode(4, {
        id: 7150327,
        instant: '2026-01-17T18:50:14Z',
        lineUpId: 2442075,
        rosterId: 164868,
        starPoints: 5,
      }),
    ).toEqual({
      type: 'touchdown',
      tpEventId: 7150327,
      instant: '2026-01-17T18:50:14Z',
      lineUpId: 2442075,
      rosterId: 164868,
      starPoints: 5,
    });
  });

  it('decodes an interception (code 5)', () => {
    expect(
      decode(5, {
        id: 7150321,
        instant: '2026-01-17T18:49:10Z',
        lineUpId: 2442076,
        rosterId: 167242,
        starPoints: 2,
      }),
    ).toEqual({
      type: 'interception',
      tpEventId: 7150321,
      instant: '2026-01-17T18:49:10Z',
      lineUpId: 2442076,
      rosterId: 167242,
      starPoints: 2,
    });
  });

  it('decodes a casualty caused (code 6)', () => {
    expect(
      decode(6, {
        id: 7150322,
        instant: '2026-01-17T18:49:20Z',
        lineUpId: 2442077,
        rosterId: 164868,
        starPoints: 3,
      }),
    ).toEqual({
      type: 'casualty_caused',
      tpEventId: 7150322,
      instant: '2026-01-17T18:49:20Z',
      lineUpId: 2442077,
      rosterId: 164868,
      starPoints: 3,
    });
  });

  it('decodes a casualty caused (code 6) with its turnNumber, when present', () => {
    expect(
      decode(6, {
        id: 7150224,
        instant: '2026-01-17T18:44:15.5783948+00:00',
        lineUpId: 2565349,
        rosterId: 168446,
        turnNumber: 14,
      }),
    ).toEqual({
      type: 'casualty_caused',
      tpEventId: 7150224,
      instant: '2026-01-17T18:44:15.5783948+00:00',
      lineUpId: 2565349,
      rosterId: 168446,
      turnNumber: 14,
    });
  });

  it('decodes an MVP award (code 7)', () => {
    expect(
      decode(7, {
        id: 7150378,
        instant: '2026-01-17T18:54:42.4449189+00:00',
        lineUpId: 2442076,
        rosterId: 164868,
        starPoints: 4,
      }),
    ).toEqual({
      type: 'mvp_award',
      tpEventId: 7150378,
      instant: '2026-01-17T18:54:42.4449189+00:00',
      lineUpId: 2442076,
      rosterId: 164868,
      starPoints: 4,
    });
  });

  it('decodes an injury (code 8) with its injuryType and acting team', () => {
    expect(
      decode(8, {
        id: 7147568,
        instant: '2026-01-17T16:32:44Z',
        lineUpId: 2459782,
        rosterId: 167242,
        turnRosterId: 168304,
        injuryType: 'Dead',
        starPoints: 0,
      }),
    ).toEqual({
      type: 'injury',
      tpEventId: 7147568,
      instant: '2026-01-17T16:32:44Z',
      lineUpId: 2459782,
      rosterId: 167242,
      turnRosterId: 168304,
      injuryType: 'Dead',
      starPoints: 0,
    });
  });

  it('decodes an injury (code 8) with its turnNumber, when present', () => {
    expect(
      decode(8, {
        id: 7150231,
        instant: '2026-01-17T18:44:30.335919+00:00',
        lineUpId: 2442083,
        rosterId: 164868,
        turnRosterId: 168446,
        turnNumber: 14,
        injuryType: 'None',
      }),
    ).toEqual({
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

  it('decodes an injury (code 8) without a turnRosterId (omits the optional field)', () => {
    const event = decode(8, {
      id: 8,
      instant: 'x',
      lineUpId: 1,
      rosterId: 2,
      injuryType: 'NigglingInjury',
    });
    expect(event).toEqual({
      type: 'injury',
      tpEventId: 8,
      instant: 'x',
      lineUpId: 1,
      rosterId: 2,
      injuryType: 'NigglingInjury',
    });
    expect(event).not.toHaveProperty('turnRosterId');
  });

  it('decodes an injury (code 8) with a "None" injuryType unchanged (the import step decides to skip it)', () => {
    const event = decode(8, {
      id: 7,
      instant: 'x',
      lineUpId: 1,
      rosterId: 2,
      injuryType: 'None',
    });
    expect(event).toMatchObject({ type: 'injury', injuryType: 'None' });
  });

  it('omits starPoints when the raw event does not report it', () => {
    const decoded = decode(8, {
      id: 7147568,
      instant: '2026-01-17T16:32:44Z',
      lineUpId: 2459782,
      rosterId: 167242,
      turnRosterId: 168304,
      injuryType: 'Dead',
    });
    expect(decoded).not.toHaveProperty('starPoints');
  });

  it('keeps a reported starPoints of 0 rather than dropping it', () => {
    const decoded = decode(4, {
      id: 7150327,
      instant: '2026-01-17T18:50:14Z',
      lineUpId: 2442075,
      rosterId: 164868,
      starPoints: 0,
    });
    expect(decoded).toMatchObject({ starPoints: 0 });
  });

  it.each([
    ['completion', 3],
    ['touchdown', 4],
    ['interception', 5],
    ['mvp_award', 7],
    ['deflection', 25],
    ['sent_off', 32],
    ['throw_team_mate', 45],
    ['successful_landing', 46],
    ['catch', 47],
  ] as const)(
    'omits starPoints on a %s (code %d) when the raw event does not report it',
    (_type, code) => {
      const decoded = decode(code, {
        id: 1,
        instant: 'x',
        lineUpId: 1,
        rosterId: 2,
      });
      expect(decoded).not.toHaveProperty('starPoints');
    },
  );

  it('decodes a weather roll (code 10) by delegating the table and raw code to WeatherTypeService', () => {
    weatherType.decode.mockReturnValue('perfect_conditions');

    const event = decode(10, {
      id: 1,
      instant: '2026-01-17T17:56:05Z',
      extraData: { weatherType: 133, weatherTable: 13 },
    });

    expect(weatherType.decode).toHaveBeenCalledWith(13, 133);
    expect(event).toEqual({
      type: 'weather_roll',
      tpEventId: 1,
      instant: '2026-01-17T17:56:05Z',
      weatherType: 'perfect_conditions',
    });
  });

  it('decodes a weather roll with no weatherTable against the classic table 0', () => {
    weatherType.decode.mockReturnValue('perfect_conditions');

    decode(10, {
      id: 1,
      instant: '2026-01-17T17:56:05Z',
      extraData: { weatherType: 104 },
    });

    expect(weatherType.decode).toHaveBeenCalledWith(0, 104);
  });

  it('decodes an inducements roll (code 11) with induced star players', () => {
    expect(
      decode(11, {
        id: 2,
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
      }),
    ).toEqual({
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

  it('decodes an inducements roll (code 11) with a fromTreasury amount', () => {
    expect(
      decode(11, {
        id: 22,
        instant: '2026-01-17T09:07:04Z',
        rosterId: 168304,
        extraData: { totalCost: 80, starPlayers: [], fromTreasury: 50 },
      }),
    ).toEqual({
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
    const event = decode(11, {
      id: 23,
      instant: '2026-01-17T09:07:04Z',
      rosterId: 168304,
      extraData: { totalCost: 20, starPlayers: [] },
    });
    expect(event).not.toHaveProperty('fromTreasury');
  });

  it('decodes a winnings roll (code 12)', () => {
    expect(
      decode(12, {
        id: 30,
        instant: '2026-01-17T11:43:26Z',
        extraData: {
          localWinnings: 60000,
          bonusLocalWinnings: 0,
          visitorWinnings: 70000,
          bonusVisitorWinnings: 0,
        },
      }),
    ).toEqual({
      type: 'winnings_roll',
      tpEventId: 30,
      instant: '2026-01-17T11:43:26Z',
      localWinnings: 60000,
      visitorWinnings: 70000,
    });
  });

  it('decodes a fan factor roll (code 13) as dedicated fans plus the d3 roll', () => {
    expect(
      decode(13, {
        id: 31,
        instant: '2026-01-17T09:02:20Z',
        extraData: {
          newFanFactorLocal: 0,
          roll1Local: 3,
          dedicatedFansLocal: 4,
          newFanFactorVisitor: 0,
          roll1Visitor: 1,
          dedicatedFansVisitor: 1,
        },
      }),
    ).toEqual({
      type: 'fan_factor_roll',
      tpEventId: 31,
      instant: '2026-01-17T09:02:20Z',
      fanFactorLocal: 7,
      fanFactorVisitor: 2,
    });
  });

  it('decodes a fan factor roll (code 13) with zero dedicated fans and a zero roll', () => {
    expect(
      decode(13, {
        id: 31,
        instant: '2026-01-17T09:02:20Z',
        extraData: {
          newFanFactorLocal: 0,
          roll1Local: 0,
          dedicatedFansLocal: 0,
          newFanFactorVisitor: 0,
          roll1Visitor: 0,
          dedicatedFansVisitor: 0,
        },
      }),
    ).toEqual({
      type: 'fan_factor_roll',
      tpEventId: 31,
      instant: '2026-01-17T09:02:20Z',
      fanFactorLocal: 0,
      fanFactorVisitor: 0,
    });
  });

  it('decodes an expensive mistake (code 14), mapping extraData.totalCost to expensiveMistake', () => {
    expect(
      decode(14, {
        id: 32,
        instant: '2026-01-17T12:42:25Z',
        rosterId: 167599,
        extraData: {
          roll: 2,
          rollTreasury: 2,
          totalCost: 20000,
          expensiveMistake: 2,
          originalTreasury: 320000,
        },
      }),
    ).toEqual({
      type: 'expensive_mistake',
      tpEventId: 32,
      instant: '2026-01-17T12:42:25Z',
      rosterId: 167599,
      expensiveMistake: 20000,
    });
  });

  it('decodes a journeyman signing (code 15)', () => {
    expect(
      decode(15, {
        id: 33,
        instant: '2026-01-17T12:42:31Z',
        rosterId: 164868,
        extraData: {
          journeymenCount: 1,
          name: 'Journeyman',
          position: 'Dwarf Lineman',
        },
      }),
    ).toEqual({
      type: 'journeyman_signing',
      tpEventId: 33,
      instant: '2026-01-17T12:42:31Z',
      rosterId: 164868,
      journeymenCount: 1,
    });
  });

  it('decodes a concession (code 20)', () => {
    expect(
      decode(20, {
        id: 34,
        instant: '2025-04-09T17:05:15Z',
        extraData: {
          noPoints: false,
          concedeLocal: false,
          concedeVisitor: true,
        },
      }),
    ).toEqual({
      type: 'concession',
      tpEventId: 34,
      instant: '2025-04-09T17:05:15Z',
      concedeLocal: false,
      concedeVisitor: true,
    });
  });

  it('decodes a prayers to Nuffle roll (code 23)', () => {
    expect(
      decode(23, {
        id: 35,
        instant: '2023-09-19T06:48:48Z',
        rosterId: 40158,
        extraData: {
          prayersToNuffle: 2,
          underdogValue: 100,
          localRosterValue: 1365,
          visitorRosterValue: 1265,
        },
      }),
    ).toEqual({
      type: 'prayers_to_nuffle',
      tpEventId: 35,
      instant: '2023-09-19T06:48:48Z',
      prayersToNuffle: 2,
    });
  });

  it('decodes a deflection (code 25)', () => {
    expect(
      decode(25, {
        id: 7150323,
        instant: '2026-01-17T18:49:30Z',
        lineUpId: 2442078,
        rosterId: 167242,
        starPoints: 1,
      }),
    ).toEqual({
      type: 'deflection',
      tpEventId: 7150323,
      instant: '2026-01-17T18:49:30Z',
      lineUpId: 2442078,
      rosterId: 167242,
      starPoints: 1,
    });
  });

  it('decodes a dedicated fans roll (code 26)', () => {
    expect(
      decode(26, {
        id: 36,
        instant: '2026-01-17T11:43:33Z',
        extraData: {
          dedicatedFansModifierLocal: -1,
          dedicatedFansModifierVisitor: 0,
          previousDedicatedFansLocal: 3,
          previousDedicatedFansVisitor: 3,
        },
      }),
    ).toEqual({
      type: 'dedicated_fans_roll',
      tpEventId: 36,
      instant: '2026-01-17T11:43:33Z',
      dedicatedFansModifierLocal: -1,
      dedicatedFansModifierVisitor: 0,
    });
  });

  it('decodes a foul (code 31) with its turnNumber and turnRosterId (real payload shape)', () => {
    expect(
      decode(31, {
        id: 7149125,
        lineUpId: 2477487,
        matchEventType: 31,
        instant: '2026-01-17T17:50:25.1365072+00:00',
        rosterId: 165280,
        turnNumber: 10,
        turnRosterId: 165280,
        starPoints: 0,
      }),
    ).toEqual({
      type: 'foul',
      tpEventId: 7149125,
      instant: '2026-01-17T17:50:25.1365072+00:00',
      lineUpId: 2477487,
      rosterId: 165280,
      turnNumber: 10,
      turnRosterId: 165280,
      starPoints: 0,
    });
  });

  it('decodes a foul (code 31) without turn fields, omitting the optional properties', () => {
    const event = decode(31, {
      id: 7150324,
      instant: '2026-01-17T18:49:40Z',
      lineUpId: 2442079,
      rosterId: 164868,
    });
    expect(event).toEqual({
      type: 'foul',
      tpEventId: 7150324,
      instant: '2026-01-17T18:49:40Z',
      lineUpId: 2442079,
      rosterId: 164868,
    });
    expect(event).not.toHaveProperty('turnNumber');
    expect(event).not.toHaveProperty('turnRosterId');
  });

  it('rejects a foul (code 31) whose turnNumber is not a number', () => {
    expect(() =>
      decode(31, {
        id: 1,
        instant: 'x',
        lineUpId: 2,
        rosterId: 3,
        turnNumber: 'ten',
      }),
    ).toThrow(/code 31/);
  });

  it('decodes a sent off (code 32)', () => {
    expect(
      decode(32, {
        id: 7150325,
        instant: '2026-01-17T18:49:50Z',
        lineUpId: 2442079,
        rosterId: 164868,
        starPoints: 0,
      }),
    ).toEqual({
      type: 'sent_off',
      tpEventId: 7150325,
      instant: '2026-01-17T18:49:50Z',
      lineUpId: 2442079,
      rosterId: 164868,
      starPoints: 0,
    });
  });

  it('decodes a secret objective (code 42) by delegating the raw code to SecretObjectiveService', () => {
    secretObjective.decode.mockReturnValue('just_a_little_further');

    const event = decode(42, {
      id: 37,
      instant: '2024-07-09T16:09:45Z',
      rosterId: 60677,
      extraData: { secretObjective: 12 },
    });

    expect(secretObjective.decode).toHaveBeenCalledWith(12);
    expect(event).toEqual({
      type: 'secret_objective',
      tpEventId: 37,
      instant: '2024-07-09T16:09:45Z',
      rosterId: 60677,
      secretObjective: 'just_a_little_further',
    });
  });

  it('decodes a successful landing (code 46)', () => {
    expect(
      decode(46, {
        id: 7150326,
        instant: '2026-01-17T18:50:00Z',
        lineUpId: 2442075,
        rosterId: 164868,
        starPoints: 1,
      }),
    ).toEqual({
      type: 'successful_landing',
      tpEventId: 7150326,
      instant: '2026-01-17T18:50:00Z',
      lineUpId: 2442075,
      rosterId: 164868,
      starPoints: 1,
    });
  });

  it('decodes a throw team-mate (code 45)', () => {
    expect(
      decode(45, {
        id: 7150325,
        instant: '2026-01-17T18:49:52Z',
        lineUpId: 2442071,
        rosterId: 164868,
        starPoints: 1,
      }),
    ).toEqual({
      type: 'throw_team_mate',
      tpEventId: 7150325,
      instant: '2026-01-17T18:49:52Z',
      lineUpId: 2442071,
      rosterId: 164868,
      starPoints: 1,
    });
  });

  it('decodes a catch (code 47)', () => {
    expect(
      decode(47, {
        id: 7150328,
        instant: '2026-01-17T18:50:03Z',
        lineUpId: 2442075,
        rosterId: 164868,
        starPoints: 1,
      }),
    ).toEqual({
      type: 'catch',
      tpEventId: 7150328,
      instant: '2026-01-17T18:50:03Z',
      lineUpId: 2442075,
      rosterId: 164868,
      starPoints: 1,
    });
  });

  it('throws a descriptive Error naming the code when a catch (code 47) is missing its actor', () => {
    expect(() => decode(47, { id: 1, instant: 'x' })).toThrow(
      /code 47.*lineUpId/s,
    );
  });

  it('throws a descriptive Error naming the code and the failing field when a payload is invalid', () => {
    expect(() =>
      decode(4, { id: 1, instant: 'x' /* missing lineUpId, rosterId */ }),
    ).toThrow(/code 4.*lineUpId/s);
  });

  it('throws a descriptive Error when an injury (code 8) has an invalid injuryType', () => {
    expect(() =>
      decode(8, {
        id: 1,
        instant: 'x',
        lineUpId: 1,
        rosterId: 2,
        injuryType: 'NotARealInjury',
      }),
    ).toThrow(/code 8.*injuryType/s);
  });
});
