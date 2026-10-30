import type { TpOfficialRace } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * How many positions one `tpOfficialTeams.import` request carries at most
 * (unless a single race is larger). The server's cost grows with positions,
 * not races, and a request this size finishes well inside the client's
 * per-request timeout.
 */
export const OFFICIAL_TEAMS_POSITION_BUDGET = 40;

/** Options for {@link TpOfficialTeamsChunkerService.chunk}. */
export interface ChunkOfficialRacesOptions {
  /** One rules set's races, stars already normalized. */
  races: TpOfficialRace[];
  /** The most positions one chunk may carry. */
  positionBudget: number;
}

/**
 * Splits one rules set's official-list races into the chunks tools/import-tp
 * sends as separate `tpOfficialTeams.import` requests.
 */
@Injectable()
export class TpOfficialTeamsChunkerService {
  /**
   * Packs whole races, in first-seen order, into chunks of at most
   * `positionBudget` positions. Every variant of one race name (official and
   * legacy) goes in the same chunk, because the server groups a position's
   * listings by race row within one request. A race name whose variants
   * together exceed the budget is sent alone.
   */
  chunk({
    races,
    positionBudget,
  }: ChunkOfficialRacesOptions): TpOfficialRace[][] {
    const chunks: TpOfficialRace[][] = [];
    let current: TpOfficialRace[] = [];
    let currentPositions = 0;
    for (const variants of this.variantsByRaceName(races)) {
      const positions = variants.reduce(
        (sum, race) => sum + race.positions.length,
        0,
      );
      if (current.length > 0 && currentPositions + positions > positionBudget) {
        chunks.push(current);
        current = [];
        currentPositions = 0;
      }
      current.push(...variants);
      currentPositions += positions;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    return chunks;
  }

  /** The races grouped by name, groups and members in first-seen order. */
  private variantsByRaceName(races: TpOfficialRace[]): TpOfficialRace[][] {
    const byName = new Map<string, TpOfficialRace[]>();
    for (const race of races) {
      const variants = byName.get(race.name) ?? [];
      variants.push(race);
      byName.set(race.name, variants);
    }
    return [...byName.values()];
  }
}
