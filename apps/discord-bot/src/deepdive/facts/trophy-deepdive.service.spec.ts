import type {
  TrophyHeader,
  TrophyRecipient,
} from '@blood-bowl-tracker/game-data';
import {
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import {
  nullEntityComponents,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE,
  DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
  DEEPDIVE_TROPHY_RECIPIENT_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import { TeamContextService } from '../../insights/team-context.service';
import { passthroughTeamContext } from '../../insights/team-context-mock.test-helpers';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { TrophyDeepdiveService } from './trophy-deepdive.service';

interface MakeServiceOptions {
  trophies: MockProxy<TrophiesService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  teamContext?: MockProxy<TeamContextService>;
  playerContext?: MockProxy<PlayerContextService>;
}

async function makeService({
  trophies,
  trophyAwards,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  teamContext = passthroughTeamContext(),
  playerContext = passthroughPlayerContext(),
}: MakeServiceOptions): Promise<{
  service: TrophyDeepdiveService;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
  teamContext: MockProxy<TeamContextService>;
  playerContext: MockProxy<PlayerContextService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrophyDeepdiveService,
      { provide: TrophiesService, useValue: trophies },
      { provide: TrophyAwardsService, useValue: trophyAwards },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TeamContextService, useValue: teamContext },
      { provide: PlayerContextService, useValue: playerContext },
    ],
  }).compile();
  return {
    service: moduleRef.get(TrophyDeepdiveService),
    databaseTimeout,
    entityComponents,
    trophyAwards,
    teamContext,
    playerContext,
  };
}

function trophyHeader(overrides: Partial<TrophyHeader> = {}): TrophyHeader {
  return {
    id: 1,
    name: 'Chaos Cup',
    description: 'The team that wins after four matches.',
    competitionGroupName: 'Major',
    ...overrides,
  };
}

function teamRecipient(
  overrides: Partial<TrophyRecipient> = {},
): TrophyRecipient {
  return {
    competitionName: 'Major Season 24',
    competitionStartDate: '2024-01-15',
    teamId: 30,
    teamName: 'Reikland Reavers',
    playerId: null,
    playerName: null,
    ...overrides,
  };
}

function playerRecipient(
  overrides: Partial<TrophyRecipient> = {},
): TrophyRecipient {
  return {
    ...teamRecipient(),
    playerId: 40,
    playerName: 'Griff Oberwald',
    ...overrides,
  };
}

function makeTrophies(
  header: TrophyHeader | undefined,
): MockProxy<TrophiesService> {
  const trophies = mock<TrophiesService>();
  trophies.findById.mockResolvedValue(header);
  return trophies;
}

/**
 * `total` defaults to the seeded rows' own length — the ordinary under-cap
 * case. Over-cap tests pass a bigger `total` (the trophy really has more
 * awards than the capped query returns) so the exact remainder is assertable.
 */
function makeAwards(
  recipients: TrophyRecipient[],
  total: number = recipients.length,
): MockProxy<TrophyAwardsService> {
  const trophyAwards = mock<TrophyAwardsService>();
  trophyAwards.countRecipients.mockResolvedValue(total);
  trophyAwards.listRecipients.mockResolvedValue(recipients);
  return trophyAwards;
}

/** The embed description of a successful resolve, split into lines. */
function descriptionLines(result: unknown): string[] {
  const reply = result as { embeds: { description: string }[] };
  return reply.embeds[0].description.split('\n');
}

describe('TrophyDeepdiveService', () => {
  it('returns the not-found message when the trophy does not exist', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(undefined),
      trophyAwards: makeAwards([]),
    });

    await expect(service.resolve(999)).resolves.toBe(
      DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the trophy timeout message when the header lookup times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([]),
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_TROPHY_TIMEOUT_MESSAGE,
    );
  });

  it('returns the recipients timeout message when the recipient count times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    // The first run() (the header) passes through; the second (the count)
    // times out, so the list query is never reached.
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service, trophyAwards } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([]),
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
    );
    expect(trophyAwards.listRecipients).not.toHaveBeenCalled();
  });

  it('returns the recipients timeout message when the recipient list times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    // The header and the count pass through; the third run() (the list of
    // recipients) times out. Both recipient calls share one message.
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
    );
  });

  it('renders the header lines and a team recipient, titled with the trophy name', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
    });

    const result = await service.resolve(1);

    const reply = result as { embeds: { title: string }[] };
    expect(reply.embeds[0].title).toBe('Chaos Cup');
    expect(descriptionLines(result)).toEqual([
      'Awarded for: Major',
      'Description: The team that wins after four matches.',
      '',
      'Recipients:',
      'Major Season 24: Reikland Reavers',
    ]);
  });

  it('omits the description line when the trophy has no description', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader({ description: null })),
      trophyAwards: makeAwards([teamRecipient()]),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).not.toContainEqual(expect.stringContaining('Description:'));
    expect(lines[0]).toBe('Awarded for: Major');
  });

  it('renders a player recipient as "<competition>: <player><context>"', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader({ name: 'Most Violent Player' })),
      trophyAwards: makeAwards([playerRecipient()]),
      playerContext: passthroughPlayerContext(
        ' (Blitzer, Reikland Reavers, Human, Season 24 Era, Ariel Fenwick)',
      ),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(
      'Major Season 24: Griff Oberwald (Blitzer, Reikland Reavers, Human, Season 24 Era, Ariel Fenwick)',
    );
  });

  it("decorates a team recipient with the team's race and coach context", async () => {
    const { service, teamContext } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
      teamContext: passthroughTeamContext(' (Human, Ariel Fenwick)'),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(
      'Major Season 24: Reikland Reavers (Human, Ariel Fenwick)',
    );
    expect(teamContext.attachSuffixes).toHaveBeenCalledWith(
      [teamRecipient()],
      expect.any(Function) as (row: unknown) => number,
      { includeRace: true, includeCoach: true },
    );
  });

  it("decorates a player recipient with the player's position, team, race, era and coach context", async () => {
    const { service, playerContext } = await makeService({
      trophies: makeTrophies(trophyHeader({ name: 'Most Violent Player' })),
      trophyAwards: makeAwards([playerRecipient()]),
    });

    await service.resolve(1);

    expect(playerContext.attachSuffixes).toHaveBeenCalledWith(
      [playerRecipient()],
      expect.any(Function) as (row: unknown) => number,
      {
        includePosition: true,
        includeTeam: true,
        includeRace: true,
        includeEra: true,
        includeCoach: true,
      },
    );
  });

  it('only decorates team recipients through the team context lookup, and player recipients through the player context lookup', async () => {
    const { service, teamContext, playerContext } = await makeService({
      trophies: makeTrophies(trophyHeader({ name: 'Most Violent Player' })),
      trophyAwards: makeAwards([playerRecipient()]),
    });

    await service.resolve(1);

    expect(teamContext.attachSuffixes).toHaveBeenCalledWith(
      [],
      expect.any(Function) as (row: unknown) => number,
      { includeRace: true, includeCoach: true },
    );
    expect(playerContext.attachSuffixes).toHaveBeenCalledWith(
      [playerRecipient()],
      expect.any(Function) as (row: unknown) => number,
      expect.anything(),
    );
  });

  it('returns the recipient context timeout message when the team/player context lookup times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    // The header, count and list pass through; the fourth run() (the
    // team/player context lookup) times out.
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_TROPHY_RECIPIENT_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('fetches exactly the recipients it shows and counts the rest separately', async () => {
    const { service, trophyAwards } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
    });

    await service.resolve(1);

    expect(trophyAwards.listRecipients).toHaveBeenCalledWith(1, 30);
    expect(trophyAwards.countRecipients).toHaveBeenCalledWith(1);
  });

  it('shows the placeholder line when the recipient count is zero', async () => {
    const { service, trophyAwards } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([], 0),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE);
    expect(trophyAwards.listRecipients).not.toHaveBeenCalled();
  });

  it('does not call the recipient list query when the count is zero', async () => {
    const { service, trophyAwards } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([], 0),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE);
    expect(trophyAwards.listRecipients).not.toHaveBeenCalled();
  });

  it('omits the components key entirely when there is nothing to link to', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([]),
      entityComponents: passthroughEntityComponents(),
    });

    const result = await service.resolve(1);

    expect(result).not.toHaveProperty('components');
  });

  it('notes the exact number of recipients beyond the 30-row cap', async () => {
    // The capped query returns 30 rows; the trophy really has 35 awards, so
    // the note must read 5 — not the "1" a limit+1 sentinel could ever prove.
    const recipients = Array.from({ length: 30 }, (_, index) =>
      teamRecipient({
        competitionName: `Season ${index + 1}`,
        teamId: index + 1,
        teamName: `Team ${index + 1}`,
      }),
    );
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards(recipients, 35),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain('Season 30: Team 30');
    expect(lines[lines.length - 1]).toBe('…and 5 more not shown.');
  });

  it('adds no overflow line when the recipients fit under the cap', async () => {
    // Two rows, and the count agrees there are only two — no remainder.
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([
        teamRecipient(),
        teamRecipient({ teamId: 31 }),
      ]),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).not.toContainEqual(
      expect.stringContaining('more not shown.'),
    );
  });

  it('builds a team drill-down button per team-trophy recipient', async () => {
    // EntityComponentsService's own dedupe/cap/chunk/select logic is covered by
    // entity-components.service.spec.ts; the passthrough stub echoes entries
    // back so this asserts only the entries this service composes.
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as unknown as {
      components: { components: unknown[] }[];
    };

    expect(result.components[0].components).toEqual([
      {
        type: 2,
        style: expect.any(Number) as number,
        label: 'Reikland Reavers',
        custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}30`,
        emoji: STUB_BUTTON_EMOJI,
      },
    ]);
  });

  it('builds a player drill-down button per player-trophy recipient', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader({ name: 'Most Violent Player' })),
      trophyAwards: makeAwards([playerRecipient()]),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as unknown as {
      components: { components: unknown[] }[];
    };

    expect(result.components[0].components).toEqual([
      {
        type: 2,
        style: expect.any(Number) as number,
        label: 'Griff Oberwald',
        custom_id: `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}40`,
        emoji: STUB_BUTTON_EMOJI,
      },
    ]);
  });

  it('appends the component overflow note to the description', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([teamRecipient()]),
      entityComponents,
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines[lines.length - 1]).toBe('…and 3 more without a link.');
  });
});
