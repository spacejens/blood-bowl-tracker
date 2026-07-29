import { PlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/** Which pieces of player context a list wants appended to each player name. */
export interface PlayerContextOptions {
  includePosition: boolean;
  includeTeam: boolean;
  includeRace: boolean;
  includeEra: boolean;
  includeCoach: boolean;
}

/**
 * Annotates rows that name a player with the player's position, team, race, era
 * and/or coach, so a reader can identify a player they do not know by name. A
 * list already scoped to one team or one era leaves those redundant pieces out
 * (see the toplist and deepdive call sites).
 *
 * One batched lookup covers the whole row set. A player the lookup has no entry
 * for gets an empty suffix rather than a partial one — every column involved is
 * NOT NULL so this should not happen, but keeping the mapping total avoids
 * rendering `undefined` into a Discord embed.
 */
@Injectable()
export class PlayerContextService {
  constructor(private readonly players: PlayersService) {}

  async attachSuffixes<T>(
    rows: T[],
    playerIdOf: (row: T) => number,
    options: PlayerContextOptions,
  ): Promise<(T & { contextSuffix: string })[]> {
    if (rows.length === 0) {
      return [];
    }
    const names = await this.players.getContextNamesByIds(rows.map(playerIdOf));
    return rows.map((row) => {
      const entry = names.get(playerIdOf(row));
      const parts =
        entry === undefined
          ? []
          : [
              ...(options.includePosition ? [entry.positionName] : []),
              ...(options.includeTeam ? [entry.teamName] : []),
              ...(options.includeRace ? [entry.raceName] : []),
              ...(options.includeEra ? [entry.eraName] : []),
              ...(options.includeCoach ? [entry.coachName] : []),
            ];
      return {
        ...row,
        contextSuffix: parts.length === 0 ? '' : ` (${parts.join(', ')})`,
      };
    });
  }
}
