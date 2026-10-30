import type { UnspentSppSnapshot } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, inArray, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { UnspentSppService } from './unspent-spp.service';
import type { ModelledUnspentSpp, UnspentSppResult } from './unspent-spp.types';

/** One player whose `players.unspent_spp` is about to be written. */
export interface UnspentSppCandidate {
  playerId: number;
  /** The spp_total about to be written. */
  sppTotal: number;
  /** The source's unspent figure with its same-snapshot total, if any. */
  snapshot: UnspentSppSnapshot | null;
}

/**
 * Decides what `players.unspent_spp` holds: a value only when it is known
 * exactly, otherwise null. How depends on how the era's rules sets price
 * advancements. Under fixed thresholds the cost of the recorded
 * advancements is fixed by their count, so the value is the total less that
 * cost when the model makes it exact; a source's own figure is ignored (BBL
 * prices every player at BB2020 costs). Under pricing by kind the history
 * cannot pin the cost down, so the source's figure is kept unless it makes
 * no sense on its own terms: negative, larger than the total reported beside
 * it, or reported beside a total other than the one being stored. Lying
 * outside the modelled range is not one of those reasons: the model is
 * incomplete, and the stored figure is what exposes that.
 */
@Injectable()
export class UnspentSppDecisionService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly unspentSpp: UnspentSppService,
  ) {}

  /** The value to store per candidate, keyed by player id. */
  async decide(
    candidates: UnspentSppCandidate[],
  ): Promise<Map<number, number | null>> {
    const decided = new Map<number, number | null>();
    if (candidates.length === 0) {
      return decided;
    }
    const modelled = await this.unspentSpp.modelledForPlayers(
      candidates.map((candidate) => candidate.playerId),
      new Map(
        candidates.map((candidate) => [candidate.playerId, candidate.sppTotal]),
      ),
    );
    for (const candidate of candidates) {
      decided.set(
        candidate.playerId,
        this.valueFor(modelled.get(candidate.playerId), candidate),
      );
    }
    return decided;
  }

  /**
   * Works the fixed-threshold value out again from the stored totals and
   * history, for a write outside an import (a trophy's granted skill) that
   * changes which advancements cost SPP. A kind-priced value is the
   * source's own figure and does not depend on the history, so it is left
   * alone. One UPDATE per distinct value.
   */
  async refreshFixedThreshold(playerIds: number[]): Promise<void> {
    if (playerIds.length === 0) {
      return;
    }
    const modelled = await this.unspentSpp.modelledForPlayers(playerIds);
    const idsByValue = new Map<number | null, number[]>();
    for (const [playerId, entry] of modelled) {
      if (entry.pricingModel !== 'fixed_threshold') {
        continue;
      }
      const value = this.exact(entry.result);
      idsByValue.set(value, [...(idsByValue.get(value) ?? []), playerId]);
    }
    for (const [unspentSpp, ids] of idsByValue) {
      await this.db
        .update(players)
        .set({ unspentSpp })
        .where(inArray(players.id, ids));
    }
  }

  private valueFor(
    entry: ModelledUnspentSpp | undefined,
    candidate: UnspentSppCandidate,
  ): number | null {
    if (entry?.pricingModel === 'fixed_threshold') {
      return this.exact(entry.result);
    }
    if (entry?.pricingModel === 'kind_priced') {
      return this.trusted(candidate);
    }
    return null;
  }

  /** The modelled value when exact; a negative one means a broken history. */
  private exact(result: UnspentSppResult): number | null {
    return result.status === 'known' &&
      result.unspentMin === result.unspentMax &&
      result.unspentMin >= 0
      ? result.unspentMin
      : null;
  }

  private trusted({ sppTotal, snapshot }: UnspentSppCandidate): number | null {
    if (snapshot === null) {
      return null;
    }
    const { unspentSpp, snapshotSppTotal } = snapshot;
    return unspentSpp >= 0 &&
      unspentSpp <= snapshotSppTotal &&
      snapshotSppTotal === sppTotal
      ? unspentSpp
      : null;
  }
}
