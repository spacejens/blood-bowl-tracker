import { Injectable } from '@nestjs/common';

import { CharacteristicChangeService } from './characteristic-change.service';
import type {
  CharacteristicEvent,
  CharacteristicEventKind,
  CharacteristicFormats,
  CharacteristicKey,
  CharacteristicLine,
  ReplayOutcome,
} from './fill-plan.types';
import { CHARACTERISTIC_KEYS } from './fill-plan.types';

export interface ReplayInput {
  /** The position's start line. */
  line: CharacteristicLine;
  formats: CharacteristicFormats;
  /** The increases and proven reductions, in any order. */
  events: readonly CharacteristicEvent[];
}

/** A line one ordering reached, with how often reductions worsened the characteristic. */
interface ReplayState {
  line: CharacteristicLine;
  worsened: number;
}

interface ApplyStep {
  state: ReplayState;
  order: readonly CharacteristicEventKind[];
  key: CharacteristicKey;
  formats: CharacteristicFormats;
}

/**
 * Replays a player's characteristic increases and proven stat reductions on
 * his position's line, in the order they happened, applying each with the
 * limits of CharacteristicChangeService as it occurs: an increase stops at
 * the best value, a reduction at the floor and after two reductions that
 * worsened the value. Events on different characteristics never interact.
 * Events of one kind on a characteristic are applied in any order, since
 * their order cannot matter. Otherwise they are ordered by time, and events
 * on the same UTC day have no known order: every ordering of them is tried,
 * and the line is certain only when all give the same value.
 *
 * Pure decision logic, with no I/O; its one collaborator is pure as well.
 */
@Injectable()
export class CharacteristicReplayService {
  constructor(private readonly changes: CharacteristicChangeService) {}

  replay(input: ReplayInput): ReplayOutcome {
    let line = { ...input.line };
    for (const key of CHARACTERISTIC_KEYS) {
      const events = input.events.filter(
        (event) => event.characteristic === key,
      );
      const outcome = this.replayKey({ ...input, line, events }, key);
      if (outcome.kind !== 'replayed') {
        return outcome;
      }
      line = outcome.line;
    }
    return { kind: 'replayed', line };
  }

  /** Replays the events of one characteristic, all of which name `key`. */
  private replayKey(input: ReplayInput, key: CharacteristicKey): ReplayOutcome {
    const groups = this.groups(input.events);
    if (groups === undefined) {
      return { kind: 'order-uncertain' };
    }
    let states: ReplayState[] = [{ line: input.line, worsened: 0 }];
    let failed = false;
    for (const group of groups) {
      const next: ReplayState[] = [];
      for (const state of states) {
        for (const order of this.orderings(group)) {
          const result = this.apply({
            state,
            order,
            key,
            formats: input.formats,
          });
          if (result === undefined) {
            failed = true;
          } else {
            next.push(result);
          }
        }
      }
      states = this.distinct(next);
      if (states.length === 0) {
        return { kind: 'unapplicable' };
      }
    }
    const values = new Set(states.map((state) => state.line[key]));
    if (failed || values.size !== 1) {
      return { kind: 'order-uncertain' };
    }
    return { kind: 'replayed', line: states[0].line };
  }

  /**
   * The event kinds in time order, grouped by UTC day; one group when the
   * events are all of one kind; undefined when a time does not parse.
   */
  private groups(
    events: readonly CharacteristicEvent[],
  ): CharacteristicEventKind[][] | undefined {
    if (new Set(events.map((event) => event.kind)).size < 2) {
      return [events.map((event) => event.kind)];
    }
    const timed = events.map((event) => ({
      kind: event.kind,
      time: Date.parse(event.at),
    }));
    if (timed.some((event) => Number.isNaN(event.time))) {
      return undefined;
    }
    timed.sort((a, b) => a.time - b.time);
    const byDay = new Map<string, CharacteristicEventKind[]>();
    for (const event of timed) {
      const utcDay = new Date(event.time).toISOString().slice(0, 10);
      byDay.set(utcDay, [...(byDay.get(utcDay) ?? []), event.kind]);
    }
    return [...byDay.values()];
  }

  /** Every distinct order of a group's event kinds. */
  private orderings(
    kinds: readonly CharacteristicEventKind[],
  ): CharacteristicEventKind[][] {
    const increases = kinds.filter((kind) => kind === 'increase').length;
    return this.arrangements(increases, kinds.length - increases);
  }

  private arrangements(
    increases: number,
    reductions: number,
  ): CharacteristicEventKind[][] {
    if (increases + reductions === 0) {
      return [[]];
    }
    const withIncrease =
      increases > 0
        ? this.arrangements(increases - 1, reductions).map(
            (rest): CharacteristicEventKind[] => ['increase', ...rest],
          )
        : [];
    const withReduction =
      reductions > 0
        ? this.arrangements(increases, reductions - 1).map(
            (rest): CharacteristicEventKind[] => ['reduction', ...rest],
          )
        : [];
    return [...withIncrease, ...withReduction];
  }

  /** The state after one order of events; undefined when an increase cannot be applied. */
  private apply(step: ApplyStep): ReplayState | undefined {
    const { order, key, formats } = step;
    let line = step.state.line;
    let worsened = step.state.worsened;
    for (const kind of order) {
      if (kind === 'increase') {
        const next = this.changes.improve({
          line,
          formats,
          characteristic: key,
        });
        if (next === undefined) {
          return undefined;
        }
        line = next;
        continue;
      }
      const next = this.changes.worsen({
        line,
        formats,
        characteristic: key,
        worsened,
      });
      if (next[key] !== line[key]) {
        worsened += 1;
      }
      line = next;
    }
    return { line, worsened };
  }

  private distinct(states: readonly ReplayState[]): ReplayState[] {
    const seen = new Map<string, ReplayState>();
    for (const state of states) {
      seen.set(JSON.stringify([state.line, state.worsened]), state);
    }
    return [...seen.values()];
  }
}
