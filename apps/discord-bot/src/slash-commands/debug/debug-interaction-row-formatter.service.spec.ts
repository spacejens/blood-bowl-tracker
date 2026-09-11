import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DebugInteractionRowFormatterService } from './debug-interaction-row-formatter.service';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');
const TIMESTAMP = `<t:${Math.floor(OCCURRED_AT.getTime() / 1000)}:f>`;
const WHO_WHERE = 'coach42 in Test League #general';

function row(
  overrides: Partial<InteractionEventRow> = {},
): InteractionEventRow {
  return {
    id: 1,
    occurredAt: OCCURRED_AT,
    kind: 'command',
    name: 'insights',
    outcome: 'success',
    errorMessage: null,
    username: 'coach42',
    guildName: 'Test League',
    channelName: 'general',
    parameters: [],
    ...overrides,
  };
}

describe('DebugInteractionRowFormatterService', () => {
  let service: DebugInteractionRowFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DebugInteractionRowFormatterService],
    }).compile();
    service = moduleRef.get(DebugInteractionRowFormatterService);
  });

  it('renders the timestamp as Discord timestamp markdown', () => {
    expect(service.describe([row()])).toBe(
      `<t:1788955200:f> — ${WHO_WHERE} — /insights — ✅`,
    );
  });

  it('renders a command as a slash-prefixed name', () => {
    expect(
      service.describe([row({ kind: 'command', name: 'onthisdate' })]),
    ).toBe(`${TIMESTAMP} — ${WHO_WHERE} — /onthisdate — ✅`);
  });

  it('renders a button as its kind and name', () => {
    expect(service.describe([row({ kind: 'button', name: 'coach:42' })])).toBe(
      `${TIMESTAMP} — ${WHO_WHERE} — button coach:42 — ✅`,
    );
  });

  it('renders a select menu as its kind and name', () => {
    expect(
      service.describe([row({ kind: 'select_menu', name: 'coach:' })]),
    ).toBe(`${TIMESTAMP} — ${WHO_WHERE} — select_menu coach: — ✅`);
  });

  it('renders parameters as comma-separated pairs in parentheses', () => {
    const rendered = service.describe([
      row({
        parameters: [
          { key: 'race', value: 'Orc' },
          { key: 'era', value: 'Classic' },
        ],
      }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — ${WHO_WHERE} — /insights (race: Orc, era: Classic) — ✅`,
    );
  });

  it('omits the parentheses entirely when there were no parameters', () => {
    expect(service.describe([row({ parameters: [] })])).not.toContain('(');
  });

  it('renders a null parameter value as a placeholder', () => {
    const rendered = service.describe([
      row({ parameters: [{ key: 'era', value: null }] }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — ${WHO_WHERE} — /insights (era: <empty>) — ✅`,
    );
  });

  it('repeats a repeated parameter key rather than grouping it', () => {
    const rendered = service.describe([
      row({
        kind: 'select_menu',
        name: 'coach:',
        parameters: [
          { key: 'value', value: 'first' },
          { key: 'value', value: 'second' },
        ],
      }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — ${WHO_WHERE} — select_menu coach: (value: first, value: second) — ✅`,
    );
  });

  it('renders a failure with its error message', () => {
    const rendered = service.describe([
      row({ outcome: 'failure', errorMessage: 'PLAYER_NOT_FOUND' }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — ${WHO_WHERE} — /insights — ❌ PLAYER_NOT_FOUND`,
    );
  });

  it('renders a failure without a message as the cross alone', () => {
    const rendered = service.describe([
      row({ outcome: 'failure', errorMessage: null }),
    ]);

    expect(rendered).toBe(`${TIMESTAMP} — ${WHO_WHERE} — /insights — ❌`);
  });

  it('puts one row per line, in the order given', () => {
    const rendered = service.describe([
      row({ name: 'insights' }),
      row({ name: 'onthisdate' }),
    ]);

    expect(rendered.split('\n')).toEqual([
      `${TIMESTAMP} — ${WHO_WHERE} — /insights — ✅`,
      `${TIMESTAMP} — ${WHO_WHERE} — /onthisdate — ✅`,
    ]);
  });

  it('renders an empty list as an empty string', () => {
    expect(service.describe([])).toBe('');
  });

  it('renders a guild interaction with a channel name as "guild #channel"', () => {
    const rendered = service.describe([
      row({ guildName: 'Test League', channelName: 'general' }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — coach42 in Test League #general — /insights — ✅`,
    );
  });

  it('renders a guild interaction with no channel name as just the guild', () => {
    const rendered = service.describe([
      row({ guildName: 'Test League', channelName: null }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — coach42 in Test League — /insights — ✅`,
    );
  });

  it('renders a DM with no channel name as "a DM" (the common case)', () => {
    const rendered = service.describe([
      row({ guildName: null, channelName: null }),
    ]);

    expect(rendered).toBe(`${TIMESTAMP} — coach42 in a DM — /insights — ✅`);
  });

  it('renders a DM that does have a channel name as "a DM #channel" (the rare case)', () => {
    const rendered = service.describe([
      row({ guildName: null, channelName: 'some-dm-channel-name' }),
    ]);

    expect(rendered).toBe(
      `${TIMESTAMP} — coach42 in a DM #some-dm-channel-name — /insights — ✅`,
    );
  });
});
