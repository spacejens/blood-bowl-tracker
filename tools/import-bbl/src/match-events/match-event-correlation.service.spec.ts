import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { BblMatchEvents } from '../matches/match-events-page-parser';
import {
  CONSEQUENCE_CATEGORY,
  MatchEventCorrelationService,
} from './match-event-correlation.service';

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

    it('carries an unidentified kind through onto both team-coded roles', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'death',
              side: 'home',
              pid: null,
              unidentifiedKind: 'mercenary_or_star',
            },
          ],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              unidentifiedKind: 'journeyman',
            },
          ],
        }),
      );

      expect(combined.actions[0]).toMatchObject({
        unidentifiedKind: 'mercenary_or_star',
      });
      expect(combined.consequences[0]).toMatchObject({
        unidentifiedKind: 'journeyman',
      });
    });

    it('carries avoidedBy through onto the team-coded consequence', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      expect(combined.consequences).toEqual([
        {
          consequenceType: 'death',
          teamCode: 'awy',
          pid: null,
          sourceBblId: '89',
          avoidedBy: 'apothecary',
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

    it('does not merge two same-type consequences that differ only by teamCode in a merged 4-team match', () => {
      // Regression test for a code-review finding on issue #316: the
      // consequence-candidate filter (`c.teamCode !== actingTeamCode`) admits
      // candidates from every other team, which in a merged four-team match
      // (two source BBL pages combined) can be up to three distinct teams —
      // unlike the action-candidate filter (`a.teamCode === actingTeamCode`),
      // which guarantees exactly one team. Two consequences from the two
      // sides of the SAME partner source match can share consequenceType,
      // pid, avoidedBy, unidentifiedKind, and sourceBblId while belonging to
      // different teams. `consequenceKey` must include `teamCode` so such
      // consequences are not wrongly judged pairwise identical to each
      // other — if they were, the group would merge even though the two
      // action candidates below differ from each other, which is exactly the
      // unsound case `correlateEvents` is supposed to reject.
      const combined = service.combineOccurrences(
        makeEvents({
          bblId: '89',
          homeTeamId: 'hme',
          awayTeamId: 'awy',
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'a1' },
            { actionType: 'serious_injury', side: 'home', pid: 'a2' },
          ],
        }),
        makeEvents({
          bblId: '90',
          homeTeamId: 'hme2',
          awayTeamId: 'awy2',
          consequences: [
            { consequenceType: 'miss_next_game', side: 'home', pid: null },
            { consequenceType: 'miss_next_game', side: 'away', pid: null },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toHaveLength(4);
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

    it('emits an avoided casualty as casualty_avoided with the prevented severity', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'death',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('merges a single avoided consequence with the single causer action', () => {
      // BBL 1262 (apothecary) / BBL 1820 (regeneration): one kill action and
      // one prevented casualty in the whole match is unambiguously one pair,
      // even though BBL names the saved victim without a player link.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'regeneration',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'death',
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'regeneration',
          consequenceAvoidedSeverity: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('merges neither consequence when a real and an avoided one both match one action', () => {
      // Two consequence candidates for one action is ambiguous: nothing in the
      // source says which of the two the action caused, so neither merges —
      // exactly like two real consequence candidates.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
          consequences: [
            { consequenceType: 'death', side: 'away', pid: 'victim' },
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
        },
        {
          consequenceType: 'death',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'victim',
        },
        {
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'death',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('merges an avoided badly_hurt with its causer action', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'badly_hurt', side: 'home', pid: 'basher' }],
          consequences: [
            {
              consequenceType: 'badly_hurt',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'badly_hurt',
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'badly_hurt',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'basher',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('merges an avoided lasting injury with its serious_injury causer action', () => {
      // The serious_injury group spans every lasting-injury consequence type,
      // and the prevented severity recorded is the specific one, not the tier.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'basher' },
          ],
          consequences: [
            {
              consequenceType: 'niggling_injury',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'serious_injury',
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'niggling_injury',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'basher',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('merges a stat_reduction_pa consequence with its serious_injury causer action', () => {
      // stat_reduction_pa is an ordinary lasting-injury consequence, so the
      // serious_injury group must accept it exactly like the other four
      // stat_reduction_* types.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'basher' },
          ],
          consequences: [
            { consequenceType: 'stat_reduction_pa', side: 'away', pid: 'v1' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'serious_injury',
          consequenceType: 'stat_reduction_pa',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'basher',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
      ]);
    });

    it('merges nothing when two avoided consequences match one action', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'apothecary',
            },
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              avoidedBy: 'regeneration',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
        },
        {
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'death',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
        {
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'regeneration',
          consequenceAvoidedSeverity: 'death',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: null,
        },
      ]);
    });

    it('carries unidentified kinds onto a merged event', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'death',
              side: 'home',
              pid: null,
              unidentifiedKind: 'mercenary_or_star',
            },
          ],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              unidentifiedKind: 'journeyman',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actingUnidentifiedKind: 'mercenary_or_star',
        consequenceUnidentifiedKind: 'journeyman',
      });
    });

    it('merges an unlinked action with a linked consequence', () => {
      // pid is not part of the matching predicate: an action with no BBL
      // player link still pairs with a normally linked victim.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'death',
              side: 'home',
              pid: null,
              unidentifiedKind: 'fans_or_random_event',
            },
          ],
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
          actingPid: null,
          actingUnidentifiedKind: 'fans_or_random_event',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'victim',
        },
      ]);
    });

    it('merges a linked action with an unlinked, non-avoided consequence', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [{ actionType: 'death', side: 'home', pid: 'killer' }],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: null,
              unidentifiedKind: 'journeyman',
            },
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
          consequencePid: null,
          consequenceUnidentifiedKind: 'journeyman',
        },
      ]);
    });

    it('carries an unidentified kind onto an unmerged action-only event', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'touchdown',
              side: 'home',
              pid: null,
              unidentifiedKind: 'fans_or_random_event',
            },
          ],
        }),
      );

      expect(service.correlateEvents(combined)).toEqual([
        {
          actionType: 'touchdown',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: null,
          actingUnidentifiedKind: 'fans_or_random_event',
        },
      ]);
    });

    it('emits a bare-foul action occurrence as a foul with a null pid', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'badly_hurt',
              side: 'home',
              pid: null,
              viaFoul: true,
            },
          ],
        }),
      );

      expect(service.correlateEvents(combined)).toEqual([
        {
          actionType: 'foul',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: null,
        },
      ]);
    });

    it('merges two identical actions with two differing consequences pairwise', () => {
      // BBL 2393: the same player is listed twice as a serious-injury causer,
      // and two different victims sustained a Miss Next Game. The two actions
      // are indistinguishable, so either pairing yields the same event set.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'gritr' },
            { actionType: 'serious_injury', side: 'home', pid: 'gritr' },
          ],
          consequences: [
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v2' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'serious_injury',
          consequenceType: 'miss_next_game',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'gritr',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
        {
          actionType: 'serious_injury',
          consequenceType: 'miss_next_game',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'gritr',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v2',
        },
      ]);
    });

    it('merges two differing actions with two identical consequences pairwise', () => {
      // The symmetric case: the consequences are indistinguishable, so which
      // action attaches to which of them cannot change the resulting set.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'a1' },
            { actionType: 'serious_injury', side: 'home', pid: 'a2' },
          ],
          consequences: [
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'serious_injury',
          consequenceType: 'miss_next_game',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'a1',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
        {
          actionType: 'serious_injury',
          consequenceType: 'miss_next_game',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'a2',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
      ]);
    });

    it('merges nothing when neither side of an equal-count group is identical', () => {
      // Two distinct causers and two distinct victims: the source says nothing
      // about which caused which, so the pairing would be a guess. Stays
      // unmerged, exactly as before.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'serious_injury', side: 'home', pid: 'a1' },
            { actionType: 'serious_injury', side: 'home', pid: 'a2' },
          ],
          consequences: [
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v1' },
            { consequenceType: 'miss_next_game', side: 'away', pid: 'v2' },
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
          actionType: 'serious_injury',
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
        {
          consequenceType: 'miss_next_game',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v2',
        },
      ]);
    });

    it('merges two identical viaFoul actions with two consequences as fouls', () => {
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            {
              actionType: 'badly_hurt',
              side: 'home',
              pid: 'fouler',
              viaFoul: true,
            },
            {
              actionType: 'badly_hurt',
              side: 'home',
              pid: 'fouler',
              viaFoul: true,
            },
          ],
          consequences: [
            { consequenceType: 'badly_hurt', side: 'away', pid: 'v1' },
            { consequenceType: 'badly_hurt', side: 'away', pid: 'v2' },
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
          consequencePid: 'v1',
        },
        {
          actionType: 'foul',
          consequenceType: 'badly_hurt',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'fouler',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v2',
        },
      ]);
    });

    it('merges two identical actions with two prevented casualties as casualty_avoided', () => {
      // The identical side here is the actions; the two prevented
      // consequences share an avoidedBy but name different victims.
      const combined = service.combineOccurrences(
        makeEvents({
          actions: [
            { actionType: 'death', side: 'home', pid: 'killer' },
            { actionType: 'death', side: 'home', pid: 'killer' },
          ],
          consequences: [
            {
              consequenceType: 'death',
              side: 'away',
              pid: 'v1',
              avoidedBy: 'apothecary',
            },
            {
              consequenceType: 'death',
              side: 'away',
              pid: 'v2',
              avoidedBy: 'apothecary',
            },
          ],
        }),
      );

      const events = service.correlateEvents(combined);

      expect(events).toEqual([
        {
          actionType: 'death',
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v1',
        },
        {
          actionType: 'death',
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'death',
          actingTeamCode: 'hme',
          actingSourceBblId: '89',
          actingPid: 'killer',
          consequenceTeamCode: 'awy',
          consequenceSourceBblId: '89',
          consequencePid: 'v2',
        },
      ]);
    });
  });
});

describe('CONSEQUENCE_CATEGORY', () => {
  it('gives casualty_avoided its own external-id slug', () => {
    expect(CONSEQUENCE_CATEGORY.casualty_avoided).toBe('cas-avoided');
  });
});
