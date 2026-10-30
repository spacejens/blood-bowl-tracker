import type {
  TpOfficialPosition,
  TpOfficialRace,
} from '@blood-bowl-tracker/api-contract';
import { TpOfficialListingPrecedenceService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/** One listing of a star, with the roster kind of the race listing it. */
interface StarListing {
  position: TpOfficialPosition;
  isOfficial: boolean;
}

/**
 * Gives every race's copy of a star player the same values before a rules
 * set's races are split into several `tpOfficialTeams.import` requests.
 *
 * A star fielded by several races lands on one database row, and the races
 * can list it with different values. The server keeps one set of values per
 * row, but only among the races of one request, so without this step the
 * request sent last would decide. The winner is chosen exactly as the server
 * would choose it for the whole rules set in one request: one listing per
 * race name first (every variant code of a race name is one race row), then
 * one across those races in first-seen order, both through
 * TpOfficialListingPrecedenceService. Every chunk then writes identical star
 * data, so chunk order cannot matter.
 */
@Injectable()
export class TpOfficialStarNormalizerService {
  constructor(
    private readonly precedence: TpOfficialListingPrecedenceService,
  ) {}

  /**
   * The races with each star's values replaced by its winning listing's;
   * every copy keeps its own name, star flag and TP position id. Regular
   * positions are returned as they are, and the input is not modified.
   */
  normalize(races: TpOfficialRace[]): TpOfficialRace[] {
    const winners = this.winningListings(races);
    return races.map((race) => ({
      ...race,
      positions: race.positions.map((position) => {
        const winner = position.isStarPlayer
          ? winners.get(position.name)
          : undefined;
        return winner === undefined
          ? position
          : this.withValuesOf(position, winner);
      }),
    }));
  }

  /** Each star name's winning listing. */
  private winningListings(
    races: TpOfficialRace[],
  ): Map<string, TpOfficialPosition> {
    const byStar = new Map<string, Map<string, StarListing>>();
    for (const race of races) {
      for (const position of race.positions) {
        if (!position.isStarPlayer) {
          continue;
        }
        let byRaceName = byStar.get(position.name);
        if (byRaceName === undefined) {
          byRaceName = new Map();
          byStar.set(position.name, byRaceName);
        }
        this.offer(byRaceName, race.name, {
          position,
          isOfficial: race.isOfficial,
        });
      }
    }
    const winners = new Map<string, TpOfficialPosition>();
    for (const [name, byRaceName] of byStar) {
      // Never empty: a star name is only added along with a listing.
      const winner = [...byRaceName.values()].reduce((current, candidate) =>
        this.precedence.replaces({ current, candidate }) ? candidate : current,
      );
      winners.set(name, winner.position);
    }
    return winners;
  }

  /** Keeps `candidate` as its race's listing unless the recorded one wins. */
  private offer(
    byRaceName: Map<string, StarListing>,
    raceName: string,
    candidate: StarListing,
  ): void {
    const current = byRaceName.get(raceName);
    if (
      current === undefined ||
      this.precedence.replaces({ current, candidate })
    ) {
      byRaceName.set(raceName, candidate);
    }
  }

  /** `position` carrying `winner`'s values. */
  private withValuesOf(
    position: TpOfficialPosition,
    winner: TpOfficialPosition,
  ): TpOfficialPosition {
    const { skillCategoriesError: _ownError, ...own } = position;
    const {
      characteristics,
      skills,
      keywordCodes,
      skillCategories,
      skillCategoriesError,
    } = winner;
    return {
      ...own,
      characteristics,
      skills,
      keywordCodes,
      skillCategories,
      ...(skillCategoriesError === undefined ? {} : { skillCategoriesError }),
    };
  }
}
