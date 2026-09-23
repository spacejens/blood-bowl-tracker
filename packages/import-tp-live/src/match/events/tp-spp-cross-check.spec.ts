import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it } from 'vitest';

import {
  ACTOR_LINE_UP_ID,
  ACTOR_PLAYER_ID,
  AWAY_ROSTER_ID,
  buildOptions,
  HOME_ROSTER_ID,
  makeKindBuilders,
  VICTIM_LINE_UP_ID,
} from './tp-match-event-kind-builders.test-helpers';

/**
 * Integration-style test of the real event-builder dispatch/aggregation
 * path, not a unit test of one builder in isolation: it runs a transcribed
 * real match's events for one player through `TpMatchEventsBuilderService`'s
 * actual builders and asserts the sum of the resulting `sppValue`s matches
 * the arithmetically expected total given each event's own `starPoints`.
 *
 * There is no independent TP-reported figure to cross-check against here —
 * `lineUps[].starPlayerPoints` was investigated as a candidate ground truth
 * and found not to correspond to SPP earned in the match it's attached to
 * (see the parse-tp commit removing it). This test is still valuable as a
 * regression guard on WHICH SPP-earning events the importer captures and how
 * it aggregates them: if a kind stops being emitted, or a paired casualty's
 * points stop travelling onto the merged injury row, this sum drifts from
 * the expected total and the test fails.
 *
 * The events below are transcribed from a real match in the TP mirror
 * (`tools/import-tp/data/fourth-era/.../match_576238.json`), narrowed to one
 * player. They are inline rather than a fixture file because that is this
 * repo's convention — the mirror is gitignored and no spec anywhere reads a
 * file from disk (see packages/parse-tp match-event-decoders.service.spec.ts).
 *
 * The casualty is deliberately a PAIRED one, folded by buildInjuryEvent into
 * the injury row rather than emitted on its own, so the merged-row SPP path
 * is exercised by the sum rather than assumed.
 */
describe('TP SPP cross-check', () => {
  /** Sum of the events' own starPoints below: 3 + 1 + 0 + 2. */
  const EXPECTED_TOTAL_SPP = 6;

  it('sums the imported per-event spp values to the expected total', async () => {
    const service = await makeKindBuilders();
    const built: UpsertMatchEvent[] = [];

    // touchdown, starPoints 3
    built.push(
      ...service.buildSimpleActionEvent(
        buildOptions({
          event: {
            type: 'touchdown',
            tpEventId: 1,
            instant: '2026-03-24T18:41:45Z',
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
            starPoints: 3,
          },
        }),
        'touchdown',
      ),
    );

    // completion, starPoints 1
    built.push(
      ...service.buildSimpleActionEvent(
        buildOptions({
          event: {
            type: 'completion',
            tpEventId: 2,
            instant: '2026-03-24T18:22:10Z',
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
            starPoints: 1,
          },
        }),
        'completion',
      ),
    );

    // foul, starPoints 0 — a real award of nothing, not a missing value
    built.push(
      ...service.buildSimpleActionEvent(
        buildOptions({
          event: {
            type: 'foul',
            tpEventId: 3,
            instant: '2026-03-24T18:30:02Z',
            lineUpId: ACTOR_LINE_UP_ID,
            rosterId: HOME_ROSTER_ID,
            turnNumber: 5,
            starPoints: 0,
          },
        }),
        'foul',
      ),
    );

    // A casualty caused, paired with the victim's injury: the causer's 2 SPP
    // must arrive on the merged injury row, since the standalone
    // casualty_caused row is never emitted.
    const pairedCasualty = {
      type: 'casualty_caused' as const,
      tpEventId: 4,
      instant: '2026-03-24T18:35:00Z',
      lineUpId: ACTOR_LINE_UP_ID,
      rosterId: HOME_ROSTER_ID,
      turnNumber: 5,
      starPoints: 2,
    };
    built.push(
      ...service.buildInjuryEvent(
        buildOptions({
          event: {
            type: 'injury',
            tpEventId: 5,
            instant: '2026-03-24T18:35:00Z',
            turnNumber: 5,
            lineUpId: VICTIM_LINE_UP_ID,
            rosterId: AWAY_ROSTER_ID,
            turnRosterId: HOME_ROSTER_ID,
            injuryType: 'NigglingInjury',
          },
          casualtyPairing: {
            casualtyByInjuryEventId: new Map([[5, pairedCasualty]]),
            pairedCasualtyEventIds: new Set([4]),
          },
        }),
      ),
    );

    const total = built
      .filter((event) => event.actingPlayerId === ACTOR_PLAYER_ID)
      .reduce((sum, event) => sum + (event.sppValue ?? 0), 0);

    expect(total).toBe(EXPECTED_TOTAL_SPP);
  });
});
