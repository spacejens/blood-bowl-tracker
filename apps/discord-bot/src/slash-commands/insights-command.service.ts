import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { buildFactTree } from '../insights/fact-tree';
import type { FactNode, FactResolver } from '../insights/fact-tree-utils';
import {
  collectLeaves,
  nextSegmentCompletions,
  resolvePath,
} from '../insights/fact-tree-utils';

const UNMATCHED_FALLBACK_MESSAGE =
  "Even the Apothecary can't make sense of that one.";
const MAX_AUTOCOMPLETE_CHOICES = 25;

@Injectable()
export class InsightsCommandService {
  private readonly factTree: FactNode;

  constructor(
    private readonly coaches: CoachesService,
    private readonly teams: TeamsService,
    private readonly matches: MatchesService,
    private readonly competitions: CompetitionsService,
    private readonly leagues: LeaguesService,
    private readonly rulesSets: RulesSetsService,
    private readonly eras: ErasService,
    private readonly players: PlayersService,
    private readonly positions: PositionsService,
    private readonly races: RacesService,
    private readonly externalSystems: ExternalSystemsService,
  ) {
    this.factTree = buildFactTree({
      coaches: this.coaches,
      teams: this.teams,
      matches: this.matches,
      competitions: this.competitions,
      leagues: this.leagues,
      rulesSets: this.rulesSets,
      eras: this.eras,
      players: this.players,
      positions: this.positions,
      races: this.races,
      externalSystems: this.externalSystems,
    });
  }

  buildCommand(): SlashCommandDefinition {
    return {
      name: 'insights',
      description: 'Share an insight drawn from the recorded game data',
      options: [
        {
          name: 'category',
          description: 'Pick a category or specific insight (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
      ],
      execute: (interaction) => this.execute(interaction),
      autocomplete: (interaction) => this.autocomplete(interaction),
    };
  }

  async execute(
    interaction: ChatInputCommandInteraction,
  ): Promise<string | InteractionReplyOptions> {
    const category = interaction.options.getString('category');
    const node = category
      ? resolvePath(this.factTree, category)
      : this.factTree;
    if (node === undefined) {
      return UNMATCHED_FALLBACK_MESSAGE;
    }
    const leaves = collectLeaves(node);
    return this.pickRandom(leaves)();
  }

  autocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<{ name: string; value: string }[]> {
    const focused = interaction.options.getFocused();
    return Promise.resolve(
      nextSegmentCompletions(this.factTree, focused)
        .slice(0, MAX_AUTOCOMPLETE_CHOICES)
        .map((path) => ({ name: path, value: path })),
    );
  }

  private pickRandom(leaves: FactResolver[]): FactResolver {
    return leaves[Math.floor(Math.random() * leaves.length)];
  }
}
