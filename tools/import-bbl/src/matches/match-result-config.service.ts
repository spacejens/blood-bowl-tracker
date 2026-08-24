import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { DRAW, matchResultOverrideSchema } from './match-config.schema';

@Injectable()
export class MatchResultConfigService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

  /**
   * Explicit BBL match id -> outcome assignments, gathered from each era's
   * optional matches.resultOverrides list and flattened into one map. The
   * value is the winning team's BBL code, or `null` when the entry's
   * `winnerTeamCode` is the literal `"draw"` — for the rare match in a
   * draw-forbidding category that genuinely ended level (a competition
   * abandoned before its roll-off).
   *
   * An override always wins over computed scores and every other signal, the
   * same way matches.categoryOverrides wins over the keyword classifier. No
   * configured overrides anywhere is not an error. A match id may appear in
   * only one entry across all eras.
   */
  getResultOverrides(): Map<string, string | null> {
    const overrides = new Map<string, string | null>();
    const seenAt = new Map<string, string>();

    this.eraConfig.getEras().forEach((era, eraIndex) => {
      (era.matches?.resultOverrides ?? []).forEach((entry, entryIndex) => {
        const location = `BBL_ERAS[${eraIndex}].matches.resultOverrides[${entryIndex}]`;
        const parsed = matchResultOverrideSchema.safeParse(entry);
        if (!parsed.success) {
          throw new Error(this.messages.format(location, parsed.error));
        }
        const { matchId, winnerTeamCode } = parsed.data;
        const existing = seenAt.get(matchId);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: match id ${matchId} has a result override in more ` +
              `than one place (${existing} and ${location}).`,
          );
        }
        seenAt.set(matchId, location);
        overrides.set(matchId, winnerTeamCode === DRAW ? null : winnerTeamCode);
      });
    });

    return overrides;
  }
}
