import {
  TpFeedAdvancement,
  TpFeedAdvancementParserService,
} from '@blood-bowl-tracker/parse-tp-feed';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { SnowflakeOrderService } from './snowflake-order.service';
import { TpFeedHistoryIndexService } from './tp-feed-history-index.service';
import type { TpFeedMessage } from './tp-feed-message.schema';

const GUILD = '111';
const CHANNEL = '222';
const TIMESTAMP = '2026-01-01T00:00:00.000+00:00';

function advancementMessage(
  id: string,
  extra: Partial<TpFeedMessage> = {},
): TpFeedMessage {
  return {
    id,
    timestamp: TIMESTAMP,
    webhook_id: '333',
    embeds: [{ author: { name: 'New skill/characteristic' } }],
    ...extra,
  };
}

function advancement(
  overrides: Partial<TpFeedAdvancement> = {},
): TpFeedAdvancement {
  return {
    playerNumber: '6',
    playerName: 'Grimgor',
    position: 'Black Orc',
    teamName: 'Rocket From The Tombs',
    rosterLink: 'https://tourplay.net/en/blood-bowl/roster/1',
    selection: 'random',
    category: 'primary',
    gain: { skill: 'Wrestle' },
    sppCost: 3,
    valueText: 'Random Primary Wrestle ★3',
    rawValue: 'Random Primary ` Wrestle ` ` ★3 `',
    ...overrides,
  };
}

describe('TpFeedHistoryIndexService', () => {
  let service: TpFeedHistoryIndexService;
  let parser: MockProxy<TpFeedAdvancementParserService>;

  beforeEach(async () => {
    parser = mock<TpFeedAdvancementParserService>();
    // SnowflakeOrderService is pure and dependency-free, so it is passed
    // real (CLAUDE.md's pure decision-service carve-out).
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpFeedHistoryIndexService,
        SnowflakeOrderService,
        { provide: TpFeedAdvancementParserService, useValue: parser },
      ],
    }).compile();
    service = moduleRef.get(TpFeedHistoryIndexService);
  });

  describe('isAdvancement', () => {
    it('accepts a webhook message whose first embed is an advancement report', () => {
      expect(service.isAdvancement(advancementMessage('1'))).toBe(true);
    });

    it('rejects a message not posted by a webhook', () => {
      expect(
        service.isAdvancement(
          advancementMessage('1', { webhook_id: undefined }),
        ),
      ).toBe(false);
    });

    it('rejects a webhook message of another kind', () => {
      expect(
        service.isAdvancement(
          advancementMessage('1', { embeds: [{ author: { name: 'Hired' } }] }),
        ),
      ).toBe(false);
    });

    it('rejects a webhook message without embeds', () => {
      expect(
        service.isAdvancement(advancementMessage('1', { embeds: [] })),
      ).toBe(false);
    });
  });

  describe('build', () => {
    it('groups reports by team and player, oldest message first, whatever the input order', () => {
      parser.parse
        .mockReturnValueOnce({ ok: true, advancement: advancement() })
        .mockReturnValueOnce({
          ok: true,
          advancement: advancement({ gain: { skill: 'Block' }, sppCost: 6 }),
        });

      const index = service.build({
        messages: [advancementMessage('20'), advancementMessage('10')],
        guildId: GUILD,
        channelId: CHANNEL,
      });

      const reports =
        index.reports['Rocket From The Tombs']['#6 Grimgor (Black Orc)'];
      expect(reports.map((r) => r.messageId)).toEqual(['10', '20']);
      expect(reports[0]).toEqual({
        messageId: '10',
        link: 'https://discord.com/channels/111/222/10',
        timestamp: TIMESTAMP,
        botReacted: false,
        rosterLink: 'https://tourplay.net/en/blood-bowl/roster/1',
        selection: 'random',
        category: 'primary',
        gain: { skill: 'Wrestle' },
        sppCost: 3,
        valueText: 'Random Primary Wrestle ★3',
        rawValue: 'Random Primary ` Wrestle ` ` ★3 `',
      });
      expect(reports[1].gain).toEqual({ skill: 'Block' });
      expect(index.unparsed).toEqual([]);
    });

    it('keeps different teams and players apart', () => {
      parser.parse
        .mockReturnValueOnce({ ok: true, advancement: advancement() })
        .mockReturnValueOnce({
          ok: true,
          advancement: advancement({ teamName: 'Other Team' }),
        })
        .mockReturnValueOnce({
          ok: true,
          advancement: advancement({ playerNumber: '7', playerName: 'Ug' }),
        });

      const index = service.build({
        messages: ['1', '2', '3'].map((id) => advancementMessage(id)),
        guildId: GUILD,
        channelId: CHANNEL,
      });

      expect(Object.keys(index.reports)).toEqual([
        'Rocket From The Tombs',
        'Other Team',
      ]);
      expect(Object.keys(index.reports['Rocket From The Tombs'])).toEqual([
        '#6 Grimgor (Black Orc)',
        '#7 Ug (Black Orc)',
      ]);
    });

    it('marks a report the bot reacted to with its check mark', () => {
      parser.parse.mockReturnValue({ ok: true, advancement: advancement() });

      const index = service.build({
        messages: [
          advancementMessage('1', {
            reactions: [{ me: true, emoji: { name: '✔️' } }],
          }),
          advancementMessage('2', {
            reactions: [{ me: false, emoji: { name: '✔️' } }],
          }),
          advancementMessage('3', {
            reactions: [{ me: true, emoji: { name: '👍' } }],
          }),
          advancementMessage('4', {
            reactions: [{ me: true, emoji: { name: null } }],
          }),
          advancementMessage('5'),
        ],
        guildId: GUILD,
        channelId: CHANNEL,
      });

      expect(
        index.reports['Rocket From The Tombs']['#6 Grimgor (Black Orc)'].map(
          (r) => r.botReacted,
        ),
      ).toEqual([true, false, false, false, false]);
    });

    it('skips messages that are not advancement reports without parsing them', () => {
      const index = service.build({
        messages: [advancementMessage('1', { webhook_id: undefined })],
        guildId: GUILD,
        channelId: CHANNEL,
      });

      expect(parser.parse).not.toHaveBeenCalled();
      expect(index).toEqual({ reports: {}, unparsed: [] });
    });

    it('lists a report whose player line, team or link did not parse as unparsed', () => {
      parser.parse.mockReturnValue({ ok: false, failedField: 'player field' });

      const index = service.build({
        messages: [advancementMessage('5')],
        guildId: GUILD,
        channelId: CHANNEL,
      });

      expect(index).toEqual({
        reports: {},
        unparsed: [
          {
            reason: 'player field did not match the expected shape',
            messageId: '5',
            link: 'https://discord.com/channels/111/222/5',
          },
        ],
      });
    });

    it('lists a report whose gain was not understood as unparsed', () => {
      parser.parse.mockReturnValue({
        ok: true,
        advancement: advancement({ gain: null, valueText: 'Something new' }),
      });

      const index = service.build({
        messages: [advancementMessage('5')],
        guildId: GUILD,
        channelId: CHANNEL,
      });

      expect(index.reports).toEqual({});
      expect(index.unparsed).toEqual([
        {
          reason: 'advancement not understood: Something new',
          messageId: '5',
          link: 'https://discord.com/channels/111/222/5',
        },
      ]);
    });
  });
});
