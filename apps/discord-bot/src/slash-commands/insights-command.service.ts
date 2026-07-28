import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { MATCH_CATEGORIES } from '@blood-bowl-tracker/api-contract';
import type { SlashCommandDefinition } from '@blood-bowl-tracker/discord-client';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  ErasService,
  LeaguesService,
} from '@blood-bowl-tracker/game-data';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE,
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_LEAGUE_MESSAGE,
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE,
  INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
  INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE,
  INSIGHTS_SCOPE_CONFLICT_MESSAGE,
  INSIGHTS_UNMATCHED_CATEGORY_MESSAGE,
} from '../error-messages';
import { FACT_TREE } from '../insights/fact-tree.token';
import type { FactLeaf, FactNode } from '../insights/fact-tree.types';
import { FactTreeUtilsService } from '../insights/fact-tree-utils.service';
import { MatchCategoryLabelService } from '../insights/facts/match-category-label.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

const MAX_AUTOCOMPLETE_CHOICES = 25;

/**
 * The single league/era/competition/match category resolved for the current
 * request, if any.
 */
interface ResolvedScope {
  league?: { id: number; name: string };
  era?: { id: number; name: string };
  competition?: { id: number; name: string };
  matchCategory?: { value: MatchCategory; label: string };
}

@Injectable()
export class InsightsCommandService implements OnModuleInit {
  constructor(
    private readonly leagues: LeaguesService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    @Inject(FACT_TREE) private readonly factTree: FactNode,
    private readonly registry: SlashCommandRegistryService,
    private readonly factTreeUtils: FactTreeUtilsService,
    private readonly categoryLabel: MatchCategoryLabelService,
  ) {}

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
          name: 'league',
          description: 'Scope the insight to a single league (optional)',
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
        {
          name: 'match-category',
          description:
            'Scope the insight to a single match category (optional)',
          type: ApplicationCommandOptionType.String,
          // Static choices rather than autocomplete: MATCH_CATEGORIES is a
          // fixed six-value enum, so Discord can present the whole list and
          // only ever sends one of these values back.
          choices: MATCH_CATEGORIES.map((category) => ({
            name: this.categoryLabel.label(category),
            value: category,
          })),
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
    const leagueOption = interaction.options.getString('league');
    const eraOption = interaction.options.getString('era');
    const competitionOption = interaction.options.getString('competition');
    const matchCategoryOption = interaction.options.getString('match-category');

    const givenCount = [
      leagueOption,
      eraOption,
      competitionOption,
      matchCategoryOption,
    ].filter((option) => option !== null).length;
    if (givenCount > 1) {
      return INSIGHTS_SCOPE_CONFLICT_MESSAGE;
    }

    const leagueResult = await this.resolveScopeOption(leagueOption, (id) =>
      this.leagues.findById(id),
    );
    if (leagueResult.kind === 'notFound') {
      return INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE;
    }
    const eraResult = await this.resolveScopeOption(eraOption, (id) =>
      this.eras.findById(id),
    );
    if (eraResult.kind === 'notFound') {
      return INSIGHTS_ERA_NOT_FOUND_MESSAGE;
    }
    const competitionResult = await this.resolveScopeOption(
      competitionOption,
      (id) => this.competitions.findById(id),
    );
    if (competitionResult.kind === 'notFound') {
      return INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE;
    }

    const resolved: ResolvedScope = {
      league: leagueResult.kind === 'found' ? leagueResult.value : undefined,
      era: eraResult.kind === 'found' ? eraResult.value : undefined,
      competition:
        competitionResult.kind === 'found'
          ? competitionResult.value
          : undefined,
      matchCategory: this.resolveMatchCategory(matchCategoryOption),
    };

    if (!category) {
      return this.resolveRandomFact(resolved);
    }

    const node = this.factTreeUtils.resolvePath(this.factTree, category);
    if (node === undefined) {
      return INSIGHTS_UNMATCHED_CATEGORY_MESSAGE;
    }

    let leaves = this.factTreeUtils.collectLeaves(node);
    if (resolved.league) {
      leaves = leaves.filter((leaf) => leaf.supportsLeague);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_LEAGUE_MESSAGE;
      }
    }
    if (resolved.era) {
      leaves = leaves.filter((leaf) => leaf.supportsEra);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE;
      }
    }
    if (resolved.competition) {
      leaves = leaves.filter((leaf) => leaf.supportsCompetition);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE;
      }
    }
    if (resolved.matchCategory) {
      leaves = leaves.filter((leaf) => leaf.supportsMatchCategory);
      if (leaves.length === 0) {
        return INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE;
      }
    }

    return this.resolveLeaf(leaves, resolved);
  }

  async resolveRandomFact(
    resolved: ResolvedScope = {},
  ): Promise<string | InteractionReplyOptions> {
    let leaves = this.factTreeUtils.collectLeaves(this.factTree);
    if (resolved.league) {
      leaves = leaves.filter((leaf) => leaf.supportsLeague);
    }
    if (resolved.era) {
      leaves = leaves.filter((leaf) => leaf.supportsEra);
    }
    if (resolved.competition) {
      leaves = leaves.filter((leaf) => leaf.supportsCompetition);
    }
    if (resolved.matchCategory) {
      leaves = leaves.filter((leaf) => leaf.supportsMatchCategory);
    }
    return this.resolveLeaf(leaves, resolved);
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
   * The match category named by the `match-category` option. Discord's static
   * choices only ever deliver one of `MATCH_CATEGORIES`, so there is no lookup
   * that can fail and no "not found" message; anything else is treated exactly
   * like an absent option.
   */
  private resolveMatchCategory(
    option: string | null,
  ): { value: MatchCategory; label: string } | undefined {
    const value = MATCH_CATEGORIES.find((category) => category === option);
    return value === undefined
      ? undefined
      : { value, label: this.categoryLabel.label(value) };
  }

  /**
   * Pick one of the candidate leaves at random and render it, suffixing the
   * embed title with the scope when the leaf is scope-aware.
   */
  private async resolveLeaf(
    leaves: FactLeaf[],
    resolved: ResolvedScope,
  ): Promise<string | InteractionReplyOptions> {
    const picked = this.pickRandom(leaves);
    const scope: FactScope = {
      leagueId: resolved.league?.id,
      eraId: resolved.era?.id,
      competitionId: resolved.competition?.id,
      category: resolved.matchCategory?.value,
    };
    const reply = await picked.resolve(scope);
    return picked.supportsLeague ||
      picked.supportsEra ||
      picked.supportsCompetition ||
      picked.supportsMatchCategory
      ? this.applyTitleSuffix(
          reply,
          resolved.league?.name ??
            resolved.era?.name ??
            resolved.competition?.name ??
            resolved.matchCategory?.label ??
            'All time',
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
    if (focused.name === 'league') {
      const leagues = await this.leagues.searchByNamePrefix(
        focused.value,
        MAX_AUTOCOMPLETE_CHOICES,
      );
      return leagues.map((row) => ({ name: row.name, value: String(row.id) }));
    }
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
    return this.factTreeUtils
      .nextSegmentCompletions(this.factTree, focused.value)
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
