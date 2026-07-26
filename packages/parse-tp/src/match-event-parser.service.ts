import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { Decoder, TpMatchEvent } from './match-event.types';
import { MatchEventDecodersService } from './match-event-decoders.service';

export type {
  TpInducedStarPlayer,
  TpInjuryType,
  TpMatchEvent,
} from './match-event.types';
export type { SecretObjective } from './secret-objective.service';
export type { WeatherType } from './weather-type.service';

const topLevelSchema = z.object({ matchEventType: z.number() });

@Injectable()
export class MatchEventParserService {
  private readonly decoders: Map<number, Decoder>;

  constructor(private readonly matchEventDecoders: MatchEventDecodersService) {
    this.decoders = this.matchEventDecoders.build();
  }

  /**
   * Decode a raw TP `matchEvents[]` array into the modeled subset. Structural
   * markers and per-roll noise (codes such as 0, 1, 18, 19, 27 — including
   * code 27, a "player assigned to line-up" structural row, not a modeled
   * roll) and any unrecognized code are silently dropped so
   * new TP codes never crash the import. `None` injuries are still returned;
   * the import step decides whether to skip them, keeping this parser a pure
   * decode. Throws a descriptive `Error` only when a *known* code's payload
   * fails its schema.
   */
  parse(rawEvents: unknown): TpMatchEvent[] {
    const array = z.array(z.unknown()).safeParse(rawEvents);
    if (!array.success) {
      throw new Error('Invalid TP match events: expected an array.');
    }
    const events: TpMatchEvent[] = [];
    for (const raw of array.data) {
      const head = topLevelSchema.safeParse(raw);
      if (!head.success) {
        continue; // no numeric matchEventType — not a decodable event
      }
      const decoder = this.decoders.get(head.data.matchEventType);
      if (decoder) {
        events.push(decoder(raw));
      }
    }
    return events;
  }
}
