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
  DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE,
  DEEPDIVE_TROPHY_TIMEOUT_MESSAGE,
} from '../../error-messages';
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
}

async function makeService({
  trophies,
  trophyAwards,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
}: MakeServiceOptions): Promise<{
  service: TrophyDeepdiveService;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrophyDeepdiveService,
      { provide: TrophiesService, useValue: trophies },
      { provide: TrophyAwardsService, useValue: trophyAwards },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(TrophyDeepdiveService),
    databaseTimeout,
    entityComponents,
    trophyAwards,
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
    competitionId: 2,
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

  it('renders a player recipient as "<competition>: <player> (<team>)"', async () => {
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader({ name: 'Most Violent Player' })),
      trophyAwards: makeAwards([playerRecipient()]),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(
      'Major Season 24: Griff Oberwald (Reikland Reavers)',
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
    const { service } = await makeService({
      trophies: makeTrophies(trophyHeader()),
      trophyAwards: makeAwards([], 0),
    });

    const lines = descriptionLines(await service.resolve(1));

    expect(lines).toContain(DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE);
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
        competitionId: index + 1,
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
