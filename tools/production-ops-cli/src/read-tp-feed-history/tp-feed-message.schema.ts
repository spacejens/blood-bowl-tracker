import { z } from 'zod';

const snowflake = z.string().regex(/^\d+$/u);

/** Only the embed parts the advancement parser reads; others are kept. */
const embedSchema = z.looseObject({
  author: z
    .looseObject({ name: z.string().optional(), url: z.string().optional() })
    .optional(),
  fields: z
    .array(z.looseObject({ name: z.string(), value: z.string().optional() }))
    .optional(),
  footer: z.looseObject({ text: z.string().optional() }).optional(),
});

/** `me` is true when the token's own user (the bot) reacted. */
const reactionSchema = z.looseObject({
  me: z.boolean(),
  emoji: z.looseObject({ name: z.string().nullable() }),
});

/**
 * One raw message from Discord's channel-messages endpoint. Loose objects, so
 * every field Discord sent survives into the saved raw file.
 */
export const tpFeedMessageSchema = z.looseObject({
  id: snowflake,
  timestamp: z.string(),
  webhook_id: z.string().optional(),
  embeds: z.array(embedSchema),
  reactions: z.array(reactionSchema).optional(),
});

export type TpFeedMessage = z.infer<typeof tpFeedMessageSchema>;

/** One page of the channel-messages endpoint. */
export const tpFeedPageSchema = z.array(tpFeedMessageSchema);

/** A guild channel; a DM channel has no `guild_id` and is refused. */
export const discordChannelSchema = z.looseObject({ guild_id: snowflake });
