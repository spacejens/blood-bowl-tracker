import {
  CompetitionsService,
  ErasService,
  LeaguesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  ERAS_LIST_NO_DATA_MESSAGE,
  TROPHIES_LIST_NO_DATA_MESSAGE,
} from '../error-messages';
import { buildFactTree } from '../insights/fact-tree';
import { FACT_TREE } from '../insights/fact-tree.token';
import type { FactLeaf, FactNode } from '../insights/fact-tree.types';
import { FactTreeUtilsService } from '../insights/fact-tree-utils.service';
import { CoachToplistService } from '../insights/facts/coach-toplist.service';
import { CompetitionGroupsListService } from '../insights/facts/competition-groups-list.service';
import { DateToplistFactsService } from '../insights/facts/date-toplist.service';
import { ErasListService } from '../insights/facts/eras-list.service';
import { ExpensiveMistakesToplistService } from '../insights/facts/expensive-mistakes-toplist.service';
import { MatchCategoryLabelService } from '../insights/facts/match-category-label.service';
import { OnThisDateFactsService } from '../insights/facts/on-this-date.service';
import { PlayerToplistService } from '../insights/facts/player-toplist.service';
import { PositionToplistService } from '../insights/facts/position-toplist.service';
import { RaceToplistService } from '../insights/facts/race-toplist.service';
import { StarPlayerToplistService } from '../insights/facts/star-player-toplist.service';
import { StarPlayersListService } from '../insights/facts/star-players-list.service';
import { StatsSummaryFactsService } from '../insights/facts/stats-summary.service';
import { TeamToplistService } from '../insights/facts/team-toplist.service';
import { TrophiesListService } from '../insights/facts/trophies-list.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

/**
 * Test-only helpers for the `/insights` command service specs.
 * Do not import from production code (beyond types/tokens/constants).
 *
 * `InsightsCommandService`'s FACT_TREE dependency is built with the real,
 * pure `buildFactTree` (a loose function, not a service — CLAUDE.md case 2
 * exemption) wired to thirteen MOCKED fact services. This keeps the real tree
 * topology (paths, supportsLeague/Era/Competition flags per leaf — already
 * verified against production by `fact-tree.spec.ts`) while every leaf's
 * actual computation is a controlled mock, so these specs never construct
 * or DI-provide a real fact service, LeaderboardService, or
 * DatabaseTimeoutService.
 */

function isLeaf(node: FactNode): node is FactLeaf {
  return typeof (node as FactLeaf).resolve === 'function';
}

/**
 * A faithful, argument-driven reimplementation of `FactTreeUtilsService`'s
 * pure tree-navigation algorithms (mirrors `fact-tree-utils.service.ts`,
 * itself covered at 100% by its own dedicated spec). Used as
 * `FactTreeUtilsService`'s mock default so InsightsCommandService's
 * category-path routing is exercised for real against whatever tree a test
 * builds, rather than hardcoded to match assertions — without constructing
 * or DI-providing the real service (forbidden per the migration
 * conventions' failure mode #1).
 */
function resolvePathImpl(tree: FactNode, path: string): FactNode | undefined {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: FactNode = tree;
  for (const segment of segments) {
    if (isLeaf(current)) {
      return undefined;
    }
    const next = current[segment];
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return current;
}

function collectLeavesImpl(node: FactNode): FactLeaf[] {
  if (isLeaf(node)) {
    return [node];
  }
  return Object.values(node).flatMap((child) => collectLeavesImpl(child));
}

function nextSegmentCompletionsImpl(
  tree: FactNode,
  partialPath: string,
): string[] {
  const segments = partialPath.split('.');
  const partialLast = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const parentPath = parentSegments.join('.');
  const parent =
    parentPath.length === 0 ? tree : resolvePathImpl(tree, parentPath);
  if (parent === undefined || isLeaf(parent)) {
    return [];
  }
  const prefix = parentSegments.length === 0 ? '' : `${parentPath}.`;
  return Object.keys(parent)
    .filter((key) => key.startsWith(partialLast))
    .map((key) => `${prefix}${key}`);
}

function makeFactTreeUtilsMock(): MockProxy<FactTreeUtilsService> {
  const utils = mock<FactTreeUtilsService>();
  utils.resolvePath.mockImplementation(resolvePathImpl);
  utils.collectLeaves.mockImplementation(collectLeavesImpl);
  utils.nextSegmentCompletions.mockImplementation(nextSegmentCompletionsImpl);
  return utils;
}

/**
 * A canned rendered reply standing in for a real fact service's rendering
 * (title/description/button formatting is that service's own concern,
 * covered by its dedicated spec — not InsightsCommandService's).
 */
function sampleEmbedReply(
  title: string,
  description: string,
): InteractionReplyOptions {
  return { embeds: [{ title, description }], components: [] };
}

export interface FactTreeMocks {
  coachToplist: MockProxy<CoachToplistService>;
  teamToplist: MockProxy<TeamToplistService>;
  playerToplist: MockProxy<PlayerToplistService>;
  raceToplist: MockProxy<RaceToplistService>;
  positionToplist: MockProxy<PositionToplistService>;
  expensiveMistakes: MockProxy<ExpensiveMistakesToplistService>;
  erasList: MockProxy<ErasListService>;
  competitionGroupsList: MockProxy<CompetitionGroupsListService>;
  statsSummary: MockProxy<StatsSummaryFactsService>;
  starPlayerToplist: MockProxy<StarPlayerToplistService>;
  starPlayersList: MockProxy<StarPlayersListService>;
  trophiesList: MockProxy<TrophiesListService>;
  onThisDate: MockProxy<OnThisDateFactsService>;
  dateToplist: MockProxy<DateToplistFactsService>;
}

/**
 * The fact services `buildFactTree` wires into leaves, each a `MockProxy`
 * with a default resolved reply — the same title/description content the
 * pre-migration game-data-fake-driven tree produced via real computation,
 * now canned directly since that computation belongs to these services' own
 * specs, not InsightsCommandService's.
 */
function makeFactTreeMocks(): FactTreeMocks {
  const coachToplist = mock<CoachToplistService>();
  coachToplist.resolveMatchesPlayed.mockResolvedValue(
    sampleEmbedReply('Coaches by matches played', '1. Roze Madder — 9'),
  );
  coachToplist.resolveMatchesWon.mockResolvedValue(
    sampleEmbedReply('Coaches by matches won', '1. Roze Madder — 5'),
  );
  coachToplist.resolveMatchesLost.mockResolvedValue(
    sampleEmbedReply('Coaches by matches lost', '1. Roze Madder — 3'),
  );
  coachToplist.resolveMatchesDrawn.mockResolvedValue(
    sampleEmbedReply('Coaches by matches drawn', '1. Roze Madder — 1'),
  );
  coachToplist.resolveTeams.mockResolvedValue(
    sampleEmbedReply('Coaches by teams', '1. Roze Madder — 3'),
  );
  coachToplist.resolveCompetitionsPlayed.mockResolvedValue(
    sampleEmbedReply('Coaches by competitions played', '1. Roze Madder — 5'),
  );
  coachToplist.resolveErasActive.mockResolvedValue(
    sampleEmbedReply('Coaches by eras active', '1. Roze Madder — 3'),
  );
  coachToplist.resolveFoulsCommitted.mockResolvedValue(
    sampleEmbedReply('Coaches by fouls committed', '1. Roze Madder — 8'),
  );
  coachToplist.resolveTimeBetweenMatchesDescending.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by longest time between matches (descending)',
      '1. Roze Madder — 45 days',
    ),
  );
  coachToplist.resolveTimeBetweenMatchesAscending.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by longest time between matches (ascending)',
      '1. Roze Madder — 12 days',
    ),
  );
  coachToplist.resolveAverageTimeBetweenMatches.mockResolvedValue(
    sampleEmbedReply(
      'Coaches by average time between matches',
      '1. Roze Madder — 8 days',
    ),
  );

  const teamToplist = mock<TeamToplistService>();
  teamToplist.resolveMatchesPlayed.mockResolvedValue(
    sampleEmbedReply('Teams by matches played', '1. 40 grinders — 12'),
  );
  teamToplist.resolveMatchesWon.mockResolvedValue(
    sampleEmbedReply('Teams by matches won', '1. 40 grinders — 7'),
  );
  teamToplist.resolveMatchesLost.mockResolvedValue(
    sampleEmbedReply('Teams by matches lost', '1. 40 grinders — 4'),
  );
  teamToplist.resolveMatchesDrawn.mockResolvedValue(
    sampleEmbedReply('Teams by matches drawn', '1. 40 grinders — 1'),
  );
  teamToplist.resolveCompetitionsPlayed.mockResolvedValue(
    sampleEmbedReply('Teams by competitions played', '1. 40 grinders — 4'),
  );
  teamToplist.resolveErasActive.mockResolvedValue(
    sampleEmbedReply('Teams by eras active', '1. 40 grinders — 3'),
  );
  teamToplist.resolveTouchdownsScored.mockResolvedValue(
    sampleEmbedReply('Teams by touchdowns scored', '1. 40 grinders — 15'),
  );
  teamToplist.resolveCompletions.mockResolvedValue(
    sampleEmbedReply('Teams by completions', '1. 40 grinders — 8'),
  );
  teamToplist.resolveInterceptions.mockResolvedValue(
    sampleEmbedReply('Teams by interceptions', '1. 40 grinders — 5'),
  );
  teamToplist.resolveDeflections.mockResolvedValue(
    sampleEmbedReply('Teams by deflections', '1. 40 grinders — 4'),
  );
  teamToplist.resolveCasualtiesCaused.mockResolvedValue(
    sampleEmbedReply('Teams by casualties inflicted', '1. 40 grinders — 22'),
  );
  teamToplist.resolveCasualtiesSuffered.mockResolvedValue(
    sampleEmbedReply('Teams by casualties suffered', '1. 40 grinders — 18'),
  );
  teamToplist.resolveSeriousInjuriesCaused.mockResolvedValue(
    sampleEmbedReply(
      'Teams by serious injuries inflicted',
      '1. 40 grinders — 7',
    ),
  );
  teamToplist.resolveSeriousInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Teams by serious injuries suffered',
      '1. 40 grinders — 6',
    ),
  );
  teamToplist.resolveLastingInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Teams by lasting injuries suffered',
      '1. 40 grinders — 4',
    ),
  );
  teamToplist.resolveDeathsCaused.mockResolvedValue(
    sampleEmbedReply('Teams by deaths inflicted', '1. 40 grinders — 4'),
  );
  teamToplist.resolveDeathsSuffered.mockResolvedValue(
    sampleEmbedReply('Teams by deaths suffered', '1. 40 grinders — 2'),
  );
  teamToplist.resolveFoulsCommitted.mockResolvedValue(
    sampleEmbedReply('Teams by fouls committed', '1. 40 grinders — 13'),
  );
  teamToplist.resolveTimesSentOff.mockResolvedValue(
    sampleEmbedReply('Teams by times sent off', '1. 40 grinders — 8'),
  );
  teamToplist.resolveTrophiesWon.mockResolvedValue(
    sampleEmbedReply('Teams by trophies won', '1. 40 grinders — 3'),
  );

  const playerToplist = mock<PlayerToplistService>();
  playerToplist.resolveMvps.mockResolvedValue(
    sampleEmbedReply('Players by MVP awards', '1. Griff Oberwald — 7'),
  );
  playerToplist.resolveTouchdownsScored.mockResolvedValue(
    sampleEmbedReply('Players by touchdowns scored', '1. Griff Oberwald — 9'),
  );
  playerToplist.resolveCompletions.mockResolvedValue(
    sampleEmbedReply('Players by completions', '1. Griff Oberwald — 6'),
  );
  playerToplist.resolveInterceptions.mockResolvedValue(
    sampleEmbedReply('Players by interceptions', '1. Griff Oberwald — 5'),
  );
  playerToplist.resolveDeflections.mockResolvedValue(
    sampleEmbedReply('Players by deflections', '1. Griff Oberwald — 4'),
  );
  playerToplist.resolveCasualtiesCaused.mockResolvedValue(
    sampleEmbedReply('Players by casualties inflicted', '1. Morg n Thorg — 11'),
  );
  playerToplist.resolveCasualtiesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Players by casualties suffered',
      '1. Griff Oberwald — 12',
    ),
  );
  playerToplist.resolveSeriousInjuriesCaused.mockResolvedValue(
    sampleEmbedReply(
      'Players by serious injuries inflicted',
      '1. Morg n Thorg — 3',
    ),
  );
  playerToplist.resolveSeriousInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Players by serious injuries suffered',
      '1. Griff Oberwald — 5',
    ),
  );
  playerToplist.resolveLastingInjuriesSuffered.mockResolvedValue(
    sampleEmbedReply(
      'Players by lasting injuries suffered',
      '1. Griff Oberwald — 4',
    ),
  );
  playerToplist.resolveDeathsCaused.mockResolvedValue(
    sampleEmbedReply('Players by deaths inflicted', '1. Morg n Thorg — 2'),
  );
  playerToplist.resolveFoulsCommitted.mockResolvedValue(
    sampleEmbedReply('Players by fouls committed', '1. Morg n Thorg — 6'),
  );
  playerToplist.resolveTimesSentOff.mockResolvedValue(
    sampleEmbedReply('Players by times sent off', '1. Morg n Thorg — 5'),
  );
  playerToplist.resolveTotalSpp.mockResolvedValue(
    sampleEmbedReply('Players by total SPP', '1. Morg n Thorg — 120'),
  );

  const raceToplist = mock<RaceToplistService>();
  raceToplist.resolveTeams.mockResolvedValue(
    sampleEmbedReply('Races by teams', '1. Orc — 12'),
  );
  raceToplist.resolveMatchesPlayed.mockResolvedValue(
    sampleEmbedReply('Races by matches played', '1. Orc — 40'),
  );
  raceToplist.resolveMatchesWon.mockResolvedValue(
    sampleEmbedReply('Races by matches won', '1. Orc — 22'),
  );
  raceToplist.resolveMatchesLost.mockResolvedValue(
    sampleEmbedReply('Races by matches lost', '1. Orc — 15'),
  );
  raceToplist.resolveMatchesDrawn.mockResolvedValue(
    sampleEmbedReply('Races by matches drawn', '1. Orc — 3'),
  );

  const positionToplist = mock<PositionToplistService>();
  positionToplist.resolvePlayers.mockResolvedValue(
    sampleEmbedReply('Positions by players', '1. Lineman (Orc) — 8'),
  );

  const expensiveMistakes = mock<ExpensiveMistakesToplistService>();
  expensiveMistakes.resolveTotal.mockResolvedValue(
    sampleEmbedReply('Teams by expensive mistakes', '1. 40 grinders — 150000'),
  );
  expensiveMistakes.resolveBiggest.mockResolvedValue(
    sampleEmbedReply('Biggest expensive mistakes', '1. 40 grinders — 150000'),
  );

  const erasList = mock<ErasListService>();
  erasList.resolve.mockResolvedValue({
    embeds: [{ title: 'Eras', description: ERAS_LIST_NO_DATA_MESSAGE }],
  });

  const competitionGroupsList = mock<CompetitionGroupsListService>();
  competitionGroupsList.resolve.mockResolvedValue(
    sampleEmbedReply('Competition groups', 'sample competition groups'),
  );

  const statsSummary = mock<StatsSummaryFactsService>();
  statsSummary.resolve.mockResolvedValue(
    sampleEmbedReply('Stats summary', 'sample stats'),
  );

  const starPlayerToplist = mock<StarPlayerToplistService>();
  starPlayerToplist.resolveTotalHires.mockResolvedValue(
    sampleEmbedReply('Star players by times hired', '1. Morg n Thorg — 7'),
  );

  const starPlayersList = mock<StarPlayersListService>();
  starPlayersList.resolve.mockResolvedValue(
    sampleEmbedReply('Star Players', 'sample star players'),
  );

  const trophiesList = mock<TrophiesListService>();
  trophiesList.resolve.mockResolvedValue({
    embeds: [{ title: 'Trophies', description: TROPHIES_LIST_NO_DATA_MESSAGE }],
  });

  const onThisDate = mock<OnThisDateFactsService>();
  onThisDate.resolveToday.mockResolvedValue(
    sampleEmbedReply('On this date', 'sample on this date'),
  );

  const dateToplist = mock<DateToplistFactsService>();
  dateToplist.resolveMatchesDescending.mockResolvedValue(
    sampleEmbedReply(
      'Dates by matches played (descending)',
      '1. February 29 — 12',
    ),
  );
  dateToplist.resolveMatchesAscending.mockResolvedValue(
    sampleEmbedReply(
      'Dates by matches played (ascending)',
      '1. February 29 — 1',
    ),
  );

  return {
    coachToplist,
    teamToplist,
    playerToplist,
    raceToplist,
    positionToplist,
    expensiveMistakes,
    erasList,
    competitionGroupsList,
    statsSummary,
    starPlayerToplist,
    starPlayersList,
    trophiesList,
    onThisDate,
    dateToplist,
  };
}

export interface MakeServiceResult {
  service: InsightsCommandService;
  leagues: MockProxy<LeaguesService>;
  eras: MockProxy<ErasService>;
  competitions: MockProxy<CompetitionsService>;
  registry: MockProxy<SlashCommandRegistryService>;
  factTreeUtils: MockProxy<FactTreeUtilsService>;
  categoryLabel: MockProxy<MatchCategoryLabelService>;
  factTreeDeps: FactTreeMocks;
}

export async function makeService(): Promise<MakeServiceResult> {
  const leagues = mock<LeaguesService>();
  leagues.findById.mockResolvedValue(undefined);
  leagues.searchByNamePrefix.mockResolvedValue([]);

  const eras = mock<ErasService>();
  eras.findById.mockResolvedValue(undefined);
  eras.searchByNamePrefix.mockResolvedValue([]);

  const competitions = mock<CompetitionsService>();
  competitions.findById.mockResolvedValue(undefined);
  competitions.searchByNamePrefix.mockResolvedValue([]);

  const registry = mock<SlashCommandRegistryService>();
  const factTreeUtils = makeFactTreeUtilsMock();
  const categoryLabel = mock<MatchCategoryLabelService>();
  // A sentinel label, not a copy of the real service's formatting: it proves
  // each choice's name comes from the label service without re-deriving what
  // that service does (which is covered by its own spec).
  categoryLabel.label.mockImplementation((category) => `Label for ${category}`);
  const factTreeDeps = makeFactTreeMocks();
  const factTree = buildFactTree(factTreeDeps);

  const moduleRef = await Test.createTestingModule({
    providers: [
      InsightsCommandService,
      { provide: LeaguesService, useValue: leagues },
      { provide: ErasService, useValue: eras },
      { provide: CompetitionsService, useValue: competitions },
      { provide: FACT_TREE, useValue: factTree },
      { provide: SlashCommandRegistryService, useValue: registry },
      { provide: FactTreeUtilsService, useValue: factTreeUtils },
      { provide: MatchCategoryLabelService, useValue: categoryLabel },
    ],
  }).compile();

  return {
    service: moduleRef.get(InsightsCommandService),
    leagues,
    eras,
    competitions,
    registry,
    factTreeUtils,
    categoryLabel,
    factTreeDeps,
  };
}

export function chatInput(
  category: string | null,
  scope: {
    era?: string | null;
    competition?: string | null;
    league?: string | null;
    matchCategory?: string | null;
  } = {},
): ChatInputCommandInteraction {
  const {
    era = null,
    competition = null,
    league = null,
    matchCategory = null,
  } = scope;
  return {
    options: {
      getString: vi.fn((name: string) =>
        name === 'era'
          ? era
          : name === 'competition'
            ? competition
            : name === 'league'
              ? league
              : name === 'match-category'
                ? matchCategory
                : category,
      ),
    },
  } as unknown as ChatInputCommandInteraction;
}

export function autocompleteInteraction(
  name: string,
  value: string,
): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name, value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}
