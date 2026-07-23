import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

export interface FactLeaf {
  supportsLeague: boolean;
  supportsEra: boolean;
  supportsCompetition: boolean;
  resolve: (scope: FactScope) => Promise<string | InteractionReplyOptions>;
}
export type FactNode = FactLeaf | { [segment: string]: FactNode };
