import type {
  PlayerDetail,
  PlayerKillerInfo,
} from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';

import {
  gougedEye,
  griff,
  makeClock,
  makePlayerDeath,
  makePlayers,
  makeService,
  makeStatusConflicts,
} from './player-deepdive.test-helpers';

const TEAM_KILLER: PlayerKillerInfo = {
  kind: 'team',
  ...gougedEye,
  viaFoul: false,
};

const KILLED_LINE =
  'Status: Killed by an unidentified player from Gouged Eye (Orc, Grimly)';

async function resolveStatus(options: {
  player: Partial<PlayerDetail>;
  killer?: PlayerKillerInfo;
  now?: Date;
  statusConflicts?: ReturnType<typeof makeStatusConflicts>;
}) {
  const player: PlayerDetail = { ...griff, ...options.player };
  const { service, statusConflicts, errorLog } = await makeService({
    players: makePlayers({
      player,
      counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
    }),
    playerDeath: makePlayerDeath(options.killer),
    clock: makeClock(options.now),
    statusConflicts: options.statusConflicts,
  });
  const result = (await service.resolve(1)) as {
    embeds: { description: string }[];
  };
  return {
    description: result.embeds[0].description,
    statusConflicts,
    errorLog,
  };
}

function withStatusLine(statusLine: string): string {
  return [
    'Team: Reikland Reavers',
    'Era: Season 5 (2020-01-01 – 2023-12-31)',
    'Race: Human',
    'Position: Blitzer',
    statusLine,
    '',
    'Touchdowns scored: 3',
  ].join('\n');
}

describe('PlayerDeepdiveService status line', () => {
  it.each([
    ['active', 'Status: Active until the end of the era'],
    [
      'temporarily_retired',
      'Status: Temporarily retired until the end of the era',
    ],
    ['retired', 'Status: Retired'],
    ['dead', 'Status: Killed'],
    [null, 'Status: Unknown'],
  ] as const)(
    'shows stored %s in an ended era as "%s" under the position',
    async (status, expected) => {
      const { description } = await resolveStatus({ player: { status } });

      expect(description).toBe(withStatusLine(expected));
    },
  );

  it.each([
    ['active', 'Status: Active'],
    ['temporarily_retired', 'Status: Temporarily retired'],
  ] as const)(
    'shows stored %s in an ongoing era as "%s"',
    async (status, expected) => {
      const { description } = await resolveStatus({
        player: { status, eraEndDate: null },
      });

      expect(description).toContain(`\n${expected}\n`);
    },
  );

  it("decides whether the era has ended from the clock's today", async () => {
    const { description } = await resolveStatus({
      player: { status: 'active', eraEndDate: '2023-12-31' },
      now: new Date('2023-06-01T12:00:00.000Z'),
    });

    expect(description).toContain('\nStatus: Active\n');
  });

  it.each(['dead', null] as const)(
    'keeps the killed line unchanged and reports nothing for a killed player stored as %s',
    async (status) => {
      const { description, statusConflicts } = await resolveStatus({
        player: { status },
        killer: TEAM_KILLER,
      });

      expect(description).toBe(withStatusLine(KILLED_LINE));
      expect(statusConflicts.report).not.toHaveBeenCalled();
    },
  );

  it.each(['active', 'retired', 'temporarily_retired'] as const)(
    'keeps the killed line and reports a killed player stored as %s',
    async (status) => {
      const { description, statusConflicts } = await resolveStatus({
        player: { status },
        killer: TEAM_KILLER,
      });

      expect(description).toBe(withStatusLine(KILLED_LINE));
      expect(statusConflicts.report).toHaveBeenCalledTimes(1);
      expect(statusConflicts.report).toHaveBeenCalledWith({
        id: 1,
        name: 'Griff Oberwald',
        status,
      });
    },
  );

  it('still replies, and logs the failure, when the conflict report rejects', async () => {
    const failure = new Error('report failed');
    const statusConflicts = makeStatusConflicts();
    statusConflicts.report.mockRejectedValue(failure);

    const { description, errorLog } = await resolveStatus({
      player: { status: 'active' },
      killer: TEAM_KILLER,
      statusConflicts,
    });

    expect(description).toBe(withStatusLine(KILLED_LINE));
    await expect.poll(() => errorLog.logError.mock.calls.length).toBe(1);
    expect(errorLog.logError).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to report a player status conflict',
      failure,
    );
  });
});
