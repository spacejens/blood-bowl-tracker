import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import type { TpInjuryType, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchEventKindBuildersService } from './tp-match-event-kind-builders.service';
import {
  ACTOR_LINE_UP_ID,
  ACTOR_PLAYER_ID,
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  buildOptions,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  makeKindBuilders,
  MATCH_DB_ID,
  TP_SYSTEM_ID,
  UNKNOWN_LINE_UP_ID,
  UNKNOWN_ROSTER_ID,
  VICTIM_LINE_UP_ID,
  VICTIM_PLAYER_ID,
} from './tp-match-event-kind-builders.test-helpers';

type CasualtyEvent = Extract<TpMatchEvent, { type: 'casualty_caused' }>;
type InjuryEvent = Extract<TpMatchEvent, { type: 'injury' }>;

function touchdown(options: {
  tpEventId: number;
  lineUpId: number;
  rosterId: number;
}): Extract<TpMatchEvent, { type: 'touchdown' }> {
  return { type: 'touchdown', instant: 'x', ...options };
}

function sentOff(options: {
  tpEventId: number;
  lineUpId: number;
  rosterId: number;
}): Extract<TpMatchEvent, { type: 'sent_off' }> {
  return { type: 'sent_off', instant: 'x', ...options };
}

function casualtyCaused(options: {
  tpEventId: number;
  lineUpId: number;
  rosterId: number;
}): CasualtyEvent {
  return { type: 'casualty_caused', instant: 'x', turnNumber: 5, ...options };
}

function foulEvent(options: {
  tpEventId: number;
  lineUpId: number;
  rosterId: number;
}): Extract<TpMatchEvent, { type: 'foul' }> {
  return { type: 'foul', instant: 'x', turnNumber: 5, ...options };
}

function injury(options: {
  tpEventId: number;
  lineUpId: number;
  rosterId: number;
  turnRosterId?: number;
  injuryType: TpInjuryType;
}): InjuryEvent {
  return { type: 'injury', instant: 'x', turnNumber: 5, ...options };
}

/**
 * Gameplay event construction: the simple single-actor actions, sent_off,
 * standalone casualty_caused, and injury (including its three
 * action-credit branches and the two injury-type mapping tables).
 * Administrative events are covered in
 * `tp-match-event-kind-builders-admin.spec.ts` — split out to stay under
 * this repo's 1000-line spec file ceiling.
 */
describe('TpMatchEventKindBuildersService gameplay events', () => {
  let service: TpMatchEventKindBuildersService;

  beforeEach(async () => {
    service = await makeKindBuilders();
  });

  describe('buildSimpleActionEvent', () => {
    it('emits one action event with the resolved acting team-era, player and external id', () => {
      const events = service.buildSimpleActionEvent(
        buildOptions({
          event: touchdown({
            tpEventId: 1,
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
          }),
        }),
        'touchdown',
      );

      expect(events).toEqual([
        {
          matchId: MATCH_DB_ID,
          actionType: 'touchdown',
          actingTeamEraId: HOME_TEAM_ERA_ID,
          actingPlayerId: ACTOR_PLAYER_ID,
          externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-1' }],
        },
      ]);
    });

    it('uses the actionType it is given, not the event type', () => {
      const [data] = service.buildSimpleActionEvent(
        buildOptions({
          event: touchdown({
            tpEventId: 2,
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
          }),
        }),
        'mvp_award',
      );

      expect(data.actionType).toBe('mvp_award');
    });

    it('omits actingTeamEraId for a rosterId with no team era in this era', () => {
      const [data] = service.buildSimpleActionEvent(
        buildOptions({
          event: touchdown({
            tpEventId: 3,
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: UNKNOWN_ROSTER_ID,
          }),
        }),
        'touchdown',
      );

      expect(data.actingTeamEraId).toBeUndefined();
      expect(data.actingPlayerId).toBe(ACTOR_PLAYER_ID);
    });

    it('omits actingPlayerId and records a non-fatal error for a lineUpId with no imported id', () => {
      const errors: ImportError[] = [];
      const [data] = service.buildSimpleActionEvent(
        buildOptions({
          event: touchdown({
            tpEventId: 4,
            lineUpId: UNKNOWN_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
          }),
          errors,
        }),
        'touchdown',
      );

      expect(data.actingPlayerId).toBeUndefined();
      expect(data.actingTeamEraId).toBe(HOME_TEAM_ERA_ID);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('no imported id');
      expect(errors[0].item).toEqual({
        match: MATCH_DB_ID,
        lineUpId: UNKNOWN_LINE_UP_ID,
      });
    });
  });

  describe('buildSentOffEvent', () => {
    it('emits a consequence-side event with the resolved team-era and player, and no action side', () => {
      const events = service.buildSentOffEvent(
        buildOptions({
          event: sentOff({
            tpEventId: 10,
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
          }),
        }),
      );

      expect(events).toEqual([
        {
          matchId: MATCH_DB_ID,
          consequenceType: 'sent_off',
          consequenceTeamEraId: HOME_TEAM_ERA_ID,
          consequencePlayerId: ACTOR_PLAYER_ID,
          externalIds: [
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-10' },
          ],
        },
      ]);
      expect(events[0].actionType).toBeUndefined();
    });

    it('omits the unresolved team-era and player, recording a non-fatal error for the player', () => {
      const errors: ImportError[] = [];
      const [data] = service.buildSentOffEvent(
        buildOptions({
          event: sentOff({
            tpEventId: 11,
            lineUpId: UNKNOWN_LINE_UP_ID,
            rosterId: UNKNOWN_ROSTER_ID,
          }),
          errors,
        }),
      );

      expect(data.consequenceTeamEraId).toBeUndefined();
      expect(data.consequencePlayerId).toBeUndefined();
      expect(errors).toHaveLength(1);
    });
  });

  describe('buildCasualtyCausedEvent', () => {
    it('emits a standalone casualty action crediting the acting player and their team-era', () => {
      const events = service.buildCasualtyCausedEvent(
        buildOptions({
          event: casualtyCaused({
            tpEventId: 20,
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
          }),
        }),
      );

      expect(events).toEqual([
        {
          matchId: MATCH_DB_ID,
          actionType: 'casualty',
          actingTeamEraId: HOME_TEAM_ERA_ID,
          actingPlayerId: ACTOR_PLAYER_ID,
          externalIds: [
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-20' },
          ],
        },
      ]);
    });

    it('omits the unresolved team-era and player, recording a non-fatal error for the player', () => {
      const errors: ImportError[] = [];
      const [data] = service.buildCasualtyCausedEvent(
        buildOptions({
          event: casualtyCaused({
            tpEventId: 21,
            lineUpId: UNKNOWN_LINE_UP_ID,
            rosterId: UNKNOWN_ROSTER_ID,
          }),
          errors,
        }),
      );

      expect(data.actingTeamEraId).toBeUndefined();
      expect(data.actingPlayerId).toBeUndefined();
      expect(errors).toHaveLength(1);
    });
  });

  describe('buildInjuryEvent', () => {
    it('credits the paired casualty attacker and buckets the severity on the action side', () => {
      const paired = casualtyCaused({
        tpEventId: 30,
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const events = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 31,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'NigglingInjury',
          }),
          casualtyPairing: {
            casualtyByInjuryEventId: new Map([[31, paired]]),
            pairedCasualtyEventIds: new Set([30]),
          },
        }),
      );

      expect(events).toEqual([
        {
          matchId: MATCH_DB_ID,
          consequenceType: 'niggling_injury',
          consequenceTeamEraId: AWAY_TEAM_ERA_ID,
          consequencePlayerId: VICTIM_PLAYER_ID,
          actionType: 'serious_injury',
          actingTeamEraId: HOME_TEAM_ERA_ID,
          actingPlayerId: ACTOR_PLAYER_ID,
          externalIds: [
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-30' },
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-31' },
          ],
        },
      ]);
    });

    it('falls back to team-only credit when unpaired but the turn roster differs from the victim', () => {
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 32,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'Dead',
          }),
        }),
      );

      expect(data.consequenceType).toBe('death');
      expect(data.consequenceTeamEraId).toBe(AWAY_TEAM_ERA_ID);
      expect(data.consequencePlayerId).toBe(VICTIM_PLAYER_ID);
      expect(data.actionType).toBe('death');
      expect(data.actingTeamEraId).toBe(HOME_TEAM_ERA_ID);
      expect(data.actingPlayerId).toBeUndefined();
      // Team-only credit names no specific action event, so there is no
      // second id to attach — unlike a paired casualty/foul, unchanged.
      expect(data.externalIds).toEqual([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-32' },
      ]);
    });

    it('emits a consequence-only event when unpaired and the turn roster is the victim itself', () => {
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 33,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: AWAY_ROSTER_ID,
            injuryType: 'PA',
          }),
        }),
      );

      expect(data.consequenceType).toBe('stat_reduction_pa');
      expect(data.actionType).toBeUndefined();
      expect(data.actingTeamEraId).toBeUndefined();
      expect(data.actingPlayerId).toBeUndefined();
    });

    it('emits a consequence-only event when unpaired and there is no turn roster at all', () => {
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 34,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            injuryType: 'None',
          }),
        }),
      );

      expect(data.consequenceType).toBe('badly_hurt');
      expect(data.actionType).toBeUndefined();
    });

    it('records a non-fatal error when the paired attacker lineUpId has no imported id', () => {
      const paired = casualtyCaused({
        tpEventId: 35,
        lineUpId: UNKNOWN_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const errors: ImportError[] = [];
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 36,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'MissNextGame',
          }),
          casualtyPairing: {
            casualtyByInjuryEventId: new Map([[36, paired]]),
            pairedCasualtyEventIds: new Set([35]),
          },
          errors,
        }),
      );

      expect(data.actingTeamEraId).toBe(HOME_TEAM_ERA_ID);
      expect(data.actingPlayerId).toBeUndefined();
      expect(errors).toHaveLength(1);
    });

    it.each<[TpInjuryType, ConsequenceType, ActionType]>([
      ['None', 'badly_hurt', 'badly_hurt'],
      ['MissNextGame', 'miss_next_game', 'serious_injury'],
      ['NigglingInjury', 'niggling_injury', 'serious_injury'],
      ['Dead', 'death', 'death'],
      ['AV', 'stat_reduction_av', 'serious_injury'],
      ['ST', 'stat_reduction_st', 'serious_injury'],
      ['MA', 'stat_reduction_ma', 'serious_injury'],
      ['PA', 'stat_reduction_pa', 'serious_injury'],
      ['AG', 'stat_reduction_ag', 'serious_injury'],
    ])(
      'maps injuryType %s to consequence %s and action severity %s',
      (injuryType, consequenceType, actionType) => {
        const paired = casualtyCaused({
          tpEventId: 40,
          lineUpId: ACTOR_LINE_UP_ID,
          rosterId: HOME_ROSTER_ID,
        });
        const [data] = service.buildInjuryEvent(
          buildOptions({
            event: injury({
              tpEventId: 41,
              lineUpId: VICTIM_LINE_UP_ID,
              rosterId: AWAY_ROSTER_ID,
              turnRosterId: HOME_ROSTER_ID,
              injuryType,
            }),
            casualtyPairing: {
              casualtyByInjuryEventId: new Map([[41, paired]]),
              pairedCasualtyEventIds: new Set([40]),
            },
          }),
        );

        expect(data.consequenceType).toBe(consequenceType);
        expect(data.actionType).toBe(actionType);
      },
    );

    it('emits ONE merged row with actionType foul when the injury is paired to a foul', () => {
      const paired = foulEvent({
        tpEventId: 50,
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const events = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 51,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'Dead',
          }),
          foulPairing: {
            foulByInjuryEventId: new Map([[51, paired]]),
            pairedFoulEventIds: new Set([50]),
          },
        }),
      );

      expect(events).toEqual([
        {
          matchId: MATCH_DB_ID,
          consequenceType: 'death',
          consequenceTeamEraId: AWAY_TEAM_ERA_ID,
          consequencePlayerId: VICTIM_PLAYER_ID,
          actionType: 'foul',
          actingTeamEraId: HOME_TEAM_ERA_ID,
          actingPlayerId: ACTOR_PLAYER_ID,
          externalIds: [
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-50' },
            { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-51' },
          ],
        },
      ]);
    });

    it('uses the foul action type instead of the severity bucket for every injury type', () => {
      const paired = foulEvent({
        tpEventId: 52,
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 53,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'None',
          }),
          foulPairing: {
            foulByInjuryEventId: new Map([[53, paired]]),
            pairedFoulEventIds: new Set([52]),
          },
        }),
      );

      expect(data.consequenceType).toBe('badly_hurt');
      expect(data.actionType).toBe('foul');
    });

    it('records a non-fatal error when the paired fouler lineUpId has no imported id', () => {
      const paired = foulEvent({
        tpEventId: 54,
        lineUpId: UNKNOWN_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const errors: ImportError[] = [];
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 55,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'MissNextGame',
          }),
          foulPairing: {
            foulByInjuryEventId: new Map([[55, paired]]),
            pairedFoulEventIds: new Set([54]),
          },
          errors,
        }),
      );

      expect(data.actionType).toBe('foul');
      expect(data.actingTeamEraId).toBe(HOME_TEAM_ERA_ID);
      expect(data.actingPlayerId).toBeUndefined();
      expect(errors).toHaveLength(1);
    });

    it('prefers the paired casualty over a paired foul when both are somehow present', () => {
      // Cannot happen by construction (correlateFouls only considers injuries
      // correlateCasualties left unattributed), but the precedence is pinned
      // so a future change to either pass cannot silently reclassify a
      // block-caused casualty as a foul.
      const pairedCasualty = casualtyCaused({
        tpEventId: 56,
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });
      const pairedFoul = foulEvent({
        tpEventId: 57,
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: AWAY_ROSTER_ID,
      });
      const [data] = service.buildInjuryEvent(
        buildOptions({
          event: injury({
            tpEventId: 58,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'NigglingInjury',
          }),
          casualtyPairing: {
            casualtyByInjuryEventId: new Map([[58, pairedCasualty]]),
            pairedCasualtyEventIds: new Set([56]),
          },
          foulPairing: {
            foulByInjuryEventId: new Map([[58, pairedFoul]]),
            pairedFoulEventIds: new Set([57]),
          },
        }),
      );

      expect(data.actionType).toBe('serious_injury');
      expect(data.actingTeamEraId).toBe(HOME_TEAM_ERA_ID);
    });
  });
});
