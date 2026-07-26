import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { MatchEventCorrelationService } from './match-event-correlation.service';

function makeEvents(overrides: Partial<BblMatchEvents> = {}): BblMatchEvents {
  return {
    bblId: '89',
    homeTeamId: 'hme',
    awayTeamId: 'awy',
    actions: [],
    consequences: [],
    ...overrides,
  };
}

describe('MatchEventCorrelationService', () => {
  let service: MatchEventCorrelationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchEventCorrelationService],
    }).compile();
    service = moduleRef.get(MatchEventCorrelationService);
  });

  describe('combineOccurrences', () => {
    it('tags each action/consequence with its side team code and source bblId', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
          consequences: [{ consequenceType: 'death', side: 'away', pid: 'p2' }],
        }),
      );

      expect(combined.teamCodes).toEqual(['hme', 'awy']);
      expect(combined.actions).toEqual([
        {
          actionType: 'touchdown',
          teamCode: 'hme',
          pid: 'p1',
          sourceBblId: '89',
        },
      ]);
      expect(combined.consequences).toEqual([
        {
          consequenceType: 'death',
          teamCode: 'awy',
          pid: 'p2',
          sourceBblId: '89',
        },
      ]);
    });

    it('merges a partner match into a single 4-team-code result without collisions', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
        }),
        makeEvents({
          bblId: '90',
          homeTeamId: 'hme2',
          awayTeamId: 'awy2',
          actions: [{ actionType: 'touchdown', side: 'away', pid: 'p2' }],
        }),
      );

      expect(combined.teamCodes).toEqual(['hme', 'awy', 'hme2', 'awy2']);
      expect(combined.actions).toHaveLength(2);
      expect(combined.actions[1]).toMatchObject({
        teamCode: 'awy2',
        sourceBblId: '90',
      });
    });

    it('records journeymen signings only for sides with a positive count', () => {
      const combined = service.combineOccurrences(
        makeEvents({ journeymenCount: { home: 2, away: 0 } }),
      );

      expect(combined.journeymenSignings).toEqual([
        { teamCode: 'hme', count: 2, sourceBblId: '89' },
      ]);
    });

    it('carries viaFoul through onto the team-coded action', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'death', side: 'home', pid: 'p1', viaFoul: true },
          ],
        }),
      );

      expect(combined.actions).toEqual([
        {
          actionType: 'death',
          teamCode: 'hme',
          pid: 'p1',
          sourceBblId: '89',
          viaFoul: true,
        },
      ]);
    });
  });

  describe('correlateEvents', () => {
    it('merges a single death action with the single matching death consequence on another team', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
          consequences: [
            { consequenceType: 'death', side: 'away', pid: 'victim' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'death',
          consequenceType: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'victim',
        },
      ]);
    });

    it('does not merge when two action candidates match the same consequence group', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'a1' },
            { actionType: 'serious_injury', side: 'home', pid: 'a2' },
          ],
          consequences: [
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toHaveLength(3);
      expect(
        events.every(
          (e) => e.consequenceType === undefined || e.actionType === undefined,
        ),
      ).toBe(true);
    });

    it('emits journeymen-signing events with a null pid and the source bblId', () => {
      const combined = service.combineOccurrences(
        makeEvents({ journeymenCount: { home: 3, away: 0 } }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'journeymen_signings',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: null,
          journeymenCount: 3,
        },
      ]);
    });

    it('emits leftover actions and consequences independently, unmerged events last', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'touchdown', side: 'home', pid: 'p1' }],
          consequences: [
            { consequenceType: 'sent_off', side: 'away', pid: 'p2' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'touchdown',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'p1',
        },
        {
          consequenceType: 'sent_off',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'p2',
        },
      ]);
    });

    it('emits a merged foul event when the single matching causer occurrence was viaFoul', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'badly_hurt',
              side: 'home',
              pid: 'fouler',
              viaFoul: true,
            },
          ],
          consequences: [
            { consequenceType: 'badly_hurt', side: 'away', pid: 'victim' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'foul',
          consequenceType: 'badly_hurt',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'fouler',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'victim',
        },
      ]);
    });

    it('still matches a viaFoul action by its severity tier, not by "foul"', () => {
      // A viaFoul `death` action must still merge with a `death` consequence:
      // the flag changes only the emitted action type, never the matching key.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'death', side: 'home', pid: 'fouler', viaFoul: true },
          ],
          consequences: [
            { consequenceType: 'death', side: 'away', pid: 'victim' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actionType: 'foul',
        consequenceType: 'death',
      });
    });

    it('emits an action-only foul when the casualty is ambiguous (2+ same-severity actions)', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'a1' },
            {
              actionType: 'serious_injury',
              side: 'home',
              pid: 'a2',
              viaFoul: true,
            },
          ],
          consequences: [
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'serious_injury',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'a1',
        },
        {
          actionType: 'foul',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'a2',
        },
        {
          consequenceType: 'miss_next_game',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
      ]);
    });

    it('leaves a pre-existing "Foulers (no cas)" action untouched', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'foul', side: 'home', pid: 'p1' }],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'foul',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'p1',
        },
      ]);
    });
  });
});
