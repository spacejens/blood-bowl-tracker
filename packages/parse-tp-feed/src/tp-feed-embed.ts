/** One embed field, as far as the advancement parser reads it. */
export interface TpFeedEmbedFieldLike {
  readonly name: string;
  readonly value?: string;
}

/**
 * The part of a TP webhook embed the advancement parser reads. Structural on
 * purpose: discord.js's `Embed` (the live bot) and the raw REST JSON a tool
 * fetches both satisfy it, so this package needs no discord.js dependency.
 */
export interface TpFeedEmbedLike {
  readonly author?: {
    readonly name?: string;
    readonly url?: string | null;
  } | null;
  readonly fields?: readonly TpFeedEmbedFieldLike[];
  readonly footer?: { readonly text?: string } | null;
}

/** The embed author name TP gives every advancement report. */
export const TP_FEED_ADVANCEMENT_AUTHOR = 'New skill/characteristic';
