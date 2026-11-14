import { describe, expect, it } from 'vitest';

import {
  discordChannelSchema,
  tpFeedPageSchema,
} from './tp-feed-message.schema';

describe('TP feed message schemas', () => {
  it('keeps every field Discord sent', () => {
    const page = [
      {
        id: '1',
        timestamp: '2026-01-01T00:00:00.000+00:00',
        embeds: [{ title: 'x', author: { name: 'a', icon_url: 'i' } }],
        extra: 1,
      },
    ];

    expect(tpFeedPageSchema.parse(page)).toEqual(page);
  });

  it('refuses a message whose id is not a snowflake', () => {
    expect(
      tpFeedPageSchema.safeParse([{ id: 'x', timestamp: 't', embeds: [] }])
        .success,
    ).toBe(false);
  });

  it('refuses a channel without a guild id', () => {
    expect(discordChannelSchema.safeParse({ id: '1' }).success).toBe(false);
  });
});
