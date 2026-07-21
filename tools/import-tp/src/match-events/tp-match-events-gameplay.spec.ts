import { describe, expect, it } from 'vitest';

import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  MATCH_DB_ID,
  matchWithEvents,
  runImport,
  runImportRaw,
  SCORER_PLAYER_ID,
  TP_SYSTEM_ID,
  VICTIM_PLAYER_ID,
} from './tp-match-events-import.test-helpers';

/**
 * Gameplay TP match events: touchdown, mvp_award, the other five simple
 * single-actor actions, sent_off, and the injury/casualty_caused
 * correlation. Administrative events and error handling are covered in
 * `tp-match-events-import.service.spec.ts` — split out to stay under this
 * repo's 1000-line spec file ceiling.
 */
describe('TpMatchEventsImportService gameplay events', () => {
  it('emits a touchdown event with the scorer and scoring team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'touchdown',
              tpEventId: 1,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        actionType: 'touchdown',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-1' }],
      }),
    );
  });

  it('emits an mvp_award event with the awarded player and their team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'mvp_award',
              tpEventId: 1,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        actionType: 'mvp_award',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-1' }],
      }),
    );
  });

  it('emits a completion event with the passer and their team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'completion',
              tpEventId: 30,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        actionType: 'completion',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-30' }],
      }),
    );
  });

  it('emits an interception event with the intercepting player and team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'interception',
              tpEventId: 31,
              instant: 'x',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'interception',
        actingTeamEraId: AWAY_TEAM_ERA_ID,
        actingPlayerId: VICTIM_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-31' }],
      }),
    );
  });

  it('emits a deflection event with the deflecting player and team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'deflection',
              tpEventId: 32,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'deflection',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-32' }],
      }),
    );
  });

  it('emits a foul event with the fouling player and team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'foul',
              tpEventId: 33,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'foul',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-33' }],
      }),
    );
  });

  it('emits a successful_landing event with the landing player and team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'successful_landing',
              tpEventId: 34,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'successful_landing',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-34' }],
      }),
    );
  });

  it('emits a sent_off consequence event with the sent-off player and team-era', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'sent_off',
              tpEventId: 35,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'sent_off',
        consequenceTeamEraId: HOME_TEAM_ERA_ID,
        consequencePlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-35' }],
      }),
    );
    expect(captured[0].actionType).toBeUndefined();
  });

  it('emits an unpaired casualty_caused event as a standalone casualty action', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'casualty_caused',
              tpEventId: 40,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
              turnNumber: 3,
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        actionType: 'casualty',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-40' }],
      }),
    );
  });

  it('pairs a casualty_caused event with its injury (same turnNumber), crediting the specific attacker and severity, and does not emit the casualty standalone', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'casualty_caused',
              tpEventId: 41,
              instant: '2026-01-17T18:00:00Z',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
              turnNumber: 6,
            },
            {
              type: 'injury',
              tpEventId: 42,
              instant: '2026-01-17T18:00:05Z',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              turnNumber: 6,
              injuryType: 'NigglingInjury',
            },
          ],
        }),
      ],
    });
    // No standalone casualty row for the paired casualty_caused event.
    expect(
      captured.filter((c) => c.externalIds[0].externalId === 'tp-41'),
    ).toHaveLength(0);
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'niggling_injury',
        consequenceTeamEraId: AWAY_TEAM_ERA_ID,
        consequencePlayerId: VICTIM_PLAYER_ID,
        actionType: 'serious_injury',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-42' }],
      }),
    );
  });

  it('buckets a None-injury casualty pairing as badly_hurt', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'casualty_caused',
              tpEventId: 43,
              instant: '2026-01-17T18:00:00Z',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
              turnNumber: 7,
            },
            {
              type: 'injury',
              tpEventId: 44,
              instant: '2026-01-17T18:00:05Z',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              turnNumber: 7,
              injuryType: 'None',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'badly_hurt',
        actionType: 'badly_hurt',
        actingPlayerId: SCORER_PLAYER_ID,
      }),
    );
  });

  it('buckets a Dead-injury casualty pairing as death', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'casualty_caused',
              tpEventId: 45,
              instant: '2026-01-17T18:00:00Z',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
              turnNumber: 8,
            },
            {
              type: 'injury',
              tpEventId: 46,
              instant: '2026-01-17T18:00:05Z',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              turnNumber: 8,
              injuryType: 'Dead',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'death',
        actionType: 'death',
        actingPlayerId: SCORER_PLAYER_ID,
      }),
    );
  });

  it('pairs even when the injury (code 8) is registered before its casualty (code 6) — async registration', async () => {
    // Array order and instant both have the injury appearing first, mirroring
    // TP's observed asynchronous event registration.
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 48,
              instant: '2026-01-17T17:59:00Z',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              turnNumber: 9,
              injuryType: 'MissNextGame',
            },
            {
              type: 'casualty_caused',
              tpEventId: 47,
              instant: '2026-01-17T18:00:00Z',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
              turnNumber: 9,
            },
          ],
        }),
      ],
    });
    expect(
      captured.filter((c) => c.externalIds[0].externalId === 'tp-47'),
    ).toHaveLength(0);
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'miss_next_game',
        actionType: 'serious_injury',
        actingPlayerId: SCORER_PLAYER_ID,
      }),
    );
  });

  it('maps a Dead injury to a death consequence with the victim, and casualty action for the opponent', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 2,
              instant: 'x',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              injuryType: 'Dead',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({
        consequenceType: 'death',
        consequenceTeamEraId: AWAY_TEAM_ERA_ID,
        consequencePlayerId: VICTIM_PLAYER_ID,
        actionType: 'death',
        actingTeamEraId: HOME_TEAM_ERA_ID,
      }),
    );
    // Unpaired (no casualty_caused event) opponent-caused fallback: team-only
    // credit, no specific player.
    expect(
      captured.find((c) => c.consequenceType === 'death')?.actingPlayerId,
    ).toBeUndefined();
  });

  it('emits a PA stat loss as a consequence-only event when self-inflicted', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 3,
              instant: 'x',
              lineUpId: 2459782,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: AWAY_ROSTER_ID,
              injuryType: 'PA',
            },
          ],
        }),
      ],
    });
    const event = captured.find(
      (c) => c.consequenceType === 'stat_reduction_pa',
    );
    expect(event).toBeDefined();
    expect(event?.actionType).toBeUndefined();
    expect(event?.actingTeamEraId).toBeUndefined();
  });

  it('emits a badly_hurt consequence (not a skip) for a None injury', async () => {
    const captured = await runImport({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'injury',
              tpEventId: 4,
              instant: 'x',
              lineUpId: 1,
              rosterId: AWAY_ROSTER_ID,
              injuryType: 'None',
            },
          ],
        }),
      ],
    });
    expect(captured).toContainEqual(
      expect.objectContaining({ consequenceType: 'badly_hurt' }),
    );
  });

  it('resolves a touchdown by an embedded star player (imported lineUpId) to a non-null player with no null-player warning', async () => {
    // lineUpId 2442075 stands in for a now-imported embedded star player:
    // runImportRaw seeds playerIdsByLineUpId with 2442075 -> SCORER_PLAYER_ID,
    // exactly as Task 3's player import would for a rostered star player.
    const { captured, errors } = await runImportRaw({
      matches: [
        matchWithEvents({
          id: 566088,
          events: [
            {
              type: 'touchdown',
              tpEventId: 1,
              instant: 'x',
              lineUpId: 2442075,
              rosterId: HOME_ROSTER_ID,
            },
          ],
        }),
      ],
    });

    expect(captured).toContainEqual(
      expect.objectContaining({
        matchId: MATCH_DB_ID,
        actionType: 'touchdown',
        actingTeamEraId: HOME_TEAM_ERA_ID,
        actingPlayerId: SCORER_PLAYER_ID,
      }),
    );
    expect(errors.some((e) => e.message.includes('no imported id'))).toBe(
      false,
    );
  });
});
