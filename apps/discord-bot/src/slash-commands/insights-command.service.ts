import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
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
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import { buildFactTree } from '../insights/fact-tree';
import type { FactLeaf, FactNode } from '../insights/fact-tree-utils';
import {
  collectLeaves,
  nextSegmentCompletions,
  resolvePath,
} from '../insights/fact-tree-utils';

const UNMATCHED_FALLBACK_MESSAGE =
  "Even the Apothecary can't make sense of that one.";
const ERA_REJECTION_MESSAGE =
  'Even the Assistant Coach cannot understand your request';
const ERA_COMPETITION_CONFLICT_MESSAGE = 'The referee rejects your request';
const COMPETITION_NOT_FOUND_MESSAGE =
  "Even the League Secretary can't find that competition in the fixture list.";
const COMPETITION_CATEGORY_REJECTION_MESSAGE =
  "Even the Ref's assistant can't scope that to a competition.";
const MAX_AUTOCOMPLETE_CHOICES = 25;

@Injectable()
export class InsightsCommandService implements OnApplicationBootstrap {
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
    private readonly discordClient: DiscordClientService,
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

  async onApplicationBootstrap(): Promise<void> {
    // registerCommands replaces a guild's full command list, so every slash
    // command must be registered in this single call.
    await this.discordClient.registerCommands([this.buildCommand()]);
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
        {
          name: 'era',
          description: 'Scope the insight to a single era (optional)',
          type: ApplicationCommandOptionType.String,
          autocomplete: true,
        },
        {
          name: 'competition',
          description: 'Scope the insight to a single competition (optional)',
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
    const eraOption = interaction.options.getString('era');
    const competitionOption = interaction.options.getString('competition');

    if (eraOption !== null && competitionOption !== null) {
      return ERA_COMPETITION_CONFLICT_MESSAGE;
    }

    let era: { id: number; name: string } | undefined;
    if (eraOption !== null) {
      const eraId = Number(eraOption);
      const found = Number.isInteger(eraId)
        ? await this.eras.findById(eraId)
        : undefined;
      if (!found) {
        return ERA_REJECTION_MESSAGE;
      }
      era = found;
    }

    let competition: { id: number; name: string } | undefined;
    if (competitionOption !== null) {
      const competitionId = Number(competitionOption);
      const found = Number.isInteger(competitionId)
        ? await this.competitions.findById(competitionId)
        : undefined;
      if (!found) {
        return COMPETITION_NOT_FOUND_MESSAGE;
      }
      competition = found;
    }

    if (!category) {
      return this.resolveRandomFact(era, competition);
    }

    const node = resolvePath(this.factTree, category);
    if (node === undefined) {
      return UNMATCHED_FALLBACK_MESSAGE;
    }

    let leaves = collectLeaves(node);
    if (era) {
      leaves = leaves.filter((leaf) => leaf.supportsEra);
      if (leaves.length === 0) {
        return ERA_REJECTION_MESSAGE;
      }
    }
    if (competition) {
      leaves = leaves.filter((leaf) => leaf.supportsCompetition);
      if (leaves.length === 0) {
        return COMPETITION_CATEGORY_REJECTION_MESSAGE;
      }
    }

    const picked = this.pickRandom(leaves);
    const reply = await picked.resolve(era?.id, competition?.id);
    return picked.supportsCompetition || picked.supportsEra
      ? this.applyTitleSuffix(
          reply,
          competition?.name ?? era?.name ?? 'All time',
        )
      : reply;
  }

  async resolveRandomFact(
    era?: { id: number; name: string },
    competition?: { id: number; name: string },
  ): Promise<string | InteractionReplyOptions> {
    let leaves = collectLeaves(this.factTree);
    if (era) {
      leaves = leaves.filter((leaf) => leaf.supportsEra);
    }
    if (competition) {
      leaves = leaves.filter((leaf) => leaf.supportsCompetition);
    }
    const picked = this.pickRandom(leaves);
    const reply = await picked.resolve(era?.id, competition?.id);
    return picked.supportsCompetition || picked.supportsEra
      ? this.applyTitleSuffix(
          reply,
          competition?.name ?? era?.name ?? 'All time',
        )
      : reply;
  }

  private applyTitleSuffix(
    reply: string | InteractionReplyOptions,
    suffix: string,
  ): string | InteractionReplyOptions {
    if (typeof reply === 'string') {
      return reply;
    }
    const embeds = reply.embeds;
    if (!embeds || embeds.length === 0) {
      return reply;
    }
    return {
      ...reply,
      embeds: embeds.map((embed, index) => {
        const title = (embed as { title?: string }).title;
        return index === 0 && title
          ? { ...embed, title: `${title} — ${suffix}` }
          : embed;
      }),
    };
  }

  async autocomplete(
    interaction: AutocompleteInteraction,
  ): Promise<{ name: string; value: string }[]> {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'era') {
      const eras = await this.eras.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return eras.map((era) => ({
        name: `${era.name} (${era.leagueName})`,
        value: String(era.id),
      }));
    }
    if (focused.name === 'competition') {
      const competitions = await this.competitions.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return competitions.map((competition) => ({
        name: `${competition.name} (${competition.leagueName})`,
        value: String(competition.id),
      }));
    }
    return nextSegmentCompletions(this.factTree, focused.value)
      .slice(0, MAX_AUTOCOMPLETE_CHOICES)
      .map((path) => ({ name: path, value: path }));
  }

  private pickRandom(leaves: FactLeaf[]): FactLeaf {
    return leaves[Math.floor(Math.random() * leaves.length)];
  }
}
