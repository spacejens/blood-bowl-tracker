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
 * Cross-check, not a unit test of one builder: TP reports each player's SPP
 * for a match on `lineUps[].starPlayerPoints`, independently of the
 * individual match events. Summing the `sppValue` the importer writes for
 * one player's events must reproduce that number. Its purpose is to catch
 * gaps in WHICH SPP-earning events the importer captures — if a kind stops
 * being emitted, or a paired casualty's points stop travelling onto the
 * merged injury row, this sum drifts from TP's own figure and the test
 * fails.
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
  /** TP's own independent figure for this player in this match. */
  const TP_REPORTED_STAR_PLAYER_POINTS = 6;

  it("sums the imported per-event spp values to TP's own per-match figure", async () => {
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

    expect(total).toBe(TP_REPORTED_STAR_PLAYER_POINTS);
  });
});
