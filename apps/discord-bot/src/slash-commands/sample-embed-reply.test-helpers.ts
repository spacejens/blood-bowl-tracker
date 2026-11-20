import type { InteractionReplyOptions } from 'discord.js';

/**
 * A canned rendered reply standing in for a real fact service's rendering
 * (title/description/button formatting is that service's own concern,
 * covered by its dedicated spec — not InsightsCommandService's).
 */
export function sampleEmbedReply(
  title: string,
  description: string,
): InteractionReplyOptions {
  return { embeds: [{ title, description }], components: [] };
}
