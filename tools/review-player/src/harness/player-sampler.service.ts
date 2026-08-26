import { Inject, Injectable } from '@nestjs/common';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import type { PlayerStratifier } from '../shared/player-stratifier';
import { PLAYER_STRATIFIERS } from '../shared/player-stratifier';
import type {
  ReviewGap,
  ReviewPlayer,
  SampledPlayer,
} from '../shared/review.types';
import { REVIEW_SOURCES } from '../shared/review.types';
import { PlayerLookupService } from './player-lookup.service';

export interface SampleResult {
  items: SampledPlayer[];
  /** Strata and overrides that produced nothing — reported, never fatal. */
  gaps: ReviewGap[];
}

const OVERRIDE_REASON = 'override';

/**
 * Decides which players the report covers: every registered stratifier's
 * strata (every stratum honours `playersPerStratum` except the SPP-discrepancy
 * one, which deliberately ignores it) plus the config's pinned override ids,
 * deduplicated so a player picked several times is reported once with every
 * reason it was picked for.
 */
@Injectable()
export class PlayerSamplerService {
  constructor(
    @Inject(PLAYER_STRATIFIERS)
    private readonly stratifiers: PlayerStratifier[],
    private readonly lookup: PlayerLookupService,
    private readonly config: ReviewPlayerConfigService,
  ) {}

  async sample(): Promise<SampleResult> {
    const limit = this.config.getPlayersPerStratum();
    const selected = new Map<string, SampledPlayer>();
    const gaps: ReviewGap[] = [];

    for (const stratifier of this.stratifiers) {
      for (const stratum of stratifier.listStrata()) {
        for (const source of stratum.sources) {
          const found = await stratifier.sampleStratum({
            source,
            stratumId: stratum.id,
            limit,
          });
          if (found.length === 0) {
            gaps.push({
              source,
              reason: `No player found for stratum "${stratum.label}"`,
            });
            continue;
          }
          for (const player of found) {
            this.merge(selected, player, stratum.label);
          }
        }
      }
    }

    for (const source of REVIEW_SOURCES) {
      const overrides = this.config.getOverrides(source);
      if (overrides.length === 0) {
        continue;
      }
      const found = await this.lookup.findByExternalIds(source, overrides);
      const foundIds = new Set(found.map((player) => player.externalId));
      for (const externalId of overrides) {
        if (!foundIds.has(externalId)) {
          gaps.push({
            source,
            reason: `Override player "${externalId}" was not found in the database`,
          });
        }
      }
      for (const player of found) {
        this.merge(selected, player, OVERRIDE_REASON);
      }
    }

    return {
      items: [...selected.values()].sort((a, b) => this.compare(a, b)),
      gaps,
    };
  }

  /** Add a player, or add one more reason to a player already selected. */
  private merge(
    selected: Map<string, SampledPlayer>,
    player: ReviewPlayer,
    reason: string,
  ): void {
    const key = `${player.source}:${player.playerId}`;
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, { ...player, selectedFor: [reason] });
      return;
    }
    if (!existing.selectedFor.includes(reason)) {
      existing.selectedFor.push(reason);
    }
  }

  /** Stable report order: source, then player name, then id. */
  private compare(a: SampledPlayer, b: SampledPlayer): number {
    if (a.source !== b.source) {
      return a.source < b.source ? -1 : 1;
    }
    if (a.playerName !== b.playerName) {
      return a.playerName < b.playerName ? -1 : 1;
    }
    return a.playerId - b.playerId;
  }
}
