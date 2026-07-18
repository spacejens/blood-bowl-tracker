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
import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE,
  INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
  INSIGHTS_ERA_COMPETITION_CONFLICT_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
  INSIGHTS_UNMATCHED_CATEGORY_MESSAGE,
} from '../error-messages';
import { buildFactTree } from '../insights/fact-tree';
import type { FactLeaf, FactNode } from '../insights/fact-tree-utils';
import {
  collectLeaves,
  nextSegmentCompletions,
  resolvePath,
} from '../insights/fact-tree-utils';
import { SlashCommandRegistryService } from './slash-command-registry.service';

const MAX_AUTOCOMPLETE_CHOICES = 25;

@Injectable()
export class InsightsCommandService implements OnModuleInit {
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
    private readonly registry: SlashCommandRegistryService,
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

  onModuleInit(): void {
    this.registry.register(this.buildCommand());
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
      return INSIGHTS_ERA_COMPETITION_CONFLICT_MESSAGE;
    }

    const eraResult = await this.resolveScopeOption(eraOption, (id) =>
      this.eras.findById(id),
    );
    if (eraResult.kind === 'notFound') {
      return INSIGHTS_ERA_NOT_FOUND_MESSAGE;
    }
    const era = eraResult.kind === 'found' ? eraResult.value : undefined;

    const competitionResult = await this.resolveScopeOption(
      competitionOption,
      (id) => this.competitions.findById(id),
    );
    if (competitionResult.kind === 'notFound') {
      return INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE;
    }
    const competition =
      competitionResult.kind === 'found' ? competitionResult.value : undefined;

    if (!category) {
      return this.resolveRandomFact(era, competition);
    }

    const node = resolvePath(this.factTree, category);
    if (node === undefined) {
      return INSIGHTS_UNMATCHED_CATEGORY_MESSAGE;
    }

    let leaves = collectLeaves(node);
    if (era) {
      leaves = leaves.filter((leaf) => leaf.supportsEra);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE;
      }
    }
    if (competition) {
      leaves = leaves.filter((leaf) => leaf.supportsCompetition);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE;
      }
    }

    return this.resolveLeaf(leaves, era, competition);
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
    return this.resolveLeaf(leaves, era, competition);
  }

  /**
   * An era or competition named by a slash-command option: absent when the
   * option was not given, `notFound` when it was given but names nothing.
   */
  private async resolveScopeOption(
    option: string | null,
    findById: (id: number) => Promise<{ id: number; name: string } | undefined>,
  ): Promise<
    | { kind: 'absent' }
    | { kind: 'found'; value: { id: number; name: string } }
    | { kind: 'notFound' }
  > {
    if (option === null) {
      return { kind: 'absent' };
    }
    const id = Number(option);
    const found = Number.isInteger(id) ? await findById(id) : undefined;
    return found ? { kind: 'found', value: found } : { kind: 'notFound' };
  }

  /**
   * Pick one of the candidate leaves at random and render it, suffixing the
   * embed title with the scope when the leaf is scope-aware.
   */
  private async resolveLeaf(
    leaves: FactLeaf[],
    era?: { id: number; name: string },
    competition?: { id: number; name: string },
  ): Promise<string | InteractionReplyOptions> {
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
      return this.toScopeChoices(eras);
    }
    if (focused.name === 'competition') {
      const competitions = await this.competitions.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return this.toScopeChoices(competitions);
    }
    return nextSegmentCompletions(this.factTree, focused.value)
      .slice(0, MAX_AUTOCOMPLETE_CHOICES)
      .map((path) => ({ name: path, value: path }));
  }

  private pickRandom(leaves: FactLeaf[]): FactLeaf {
    return leaves[Math.floor(Math.random() * leaves.length)];
  }

  /** The autocomplete choice shape for a named, league-scoped entity. */
  private toScopeChoices(
    rows: { id: number; name: string; leagueName: string }[],
  ): { name: string; value: string }[] {
    return rows.map((row) => ({
      name: `${row.name} (${row.leagueName})`,
      value: String(row.id),
    }));
  }
}
