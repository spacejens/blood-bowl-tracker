import type { Message } from 'discord.js';

/**
 * The subset of a Discord embed the TP feed parser reads. Deliberately a
 * hand-written shape rather than discord.js's `Embed` class: these fixtures
 * are transcribed from raw captured API payloads, and constructing real
 * `Embed` instances would add nothing the parser can tell apart.
 */
export interface SampleEmbed {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline: boolean }[];
  author?: { name?: string; url?: string };
  footer?: { text: string };
}

export const SAMPLE_MESSAGE_ID = '1400000000000000001';
export const SAMPLE_CHANNEL_ID = '1400000000000000002';
export const SAMPLE_WEBHOOK_ID = '1400000000000000003';

/** A webhook-posted message carrying one embed — the TP notification shape. */
export function sampleMessage(embed: SampleEmbed): Message {
  return {
    id: SAMPLE_MESSAGE_ID,
    channelId: SAMPLE_CHANNEL_ID,
    webhookId: SAMPLE_WEBHOOK_ID,
    embeds: [{ fields: [], ...embed }],
  } as unknown as Message;
}

export function matchStartMessage(): Message {
  return sampleMessage({
    title: ':football:  1 min - Start of match',
    fields: [
      {
        name: '**EVERVAIN EGRETS**\n`1400` High Elf\n:flag_se: Patrick M',
        value: '`      0      `',
        inline: true,
      },
      {
        name: '**ROCKET FROM THE TOMBS**\n`1575` Tomb Kings\n:flag_se: Andreas Gunnarsson',
        value: '`      0      `',
        inline: true,
      },
    ],
    author: {
      url: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670570',
    },
  });
}

export function matchEndDrawMessage(): Message {
  return sampleMessage({
    title: ':checkered_flag:  End of the match',
    description: 'Draw in 2 hours and 46 minutes.',
    fields: [
      {
        name: '**EVERVAIN EGRETS**\n`1290` High Elf\n:flag_se: Patrick M',
        value: '`      0      `',
        inline: true,
      },
      {
        name: '**ROCKET FROM THE TOMBS**\n`1650` Tomb Kings\n:flag_se: Andreas Gunnarsson',
        value: '`      0      `',
        inline: true,
      },
      {
        name: 'Total winnings',
        value: '` +70,000 ` ` +70,000 `',
        inline: false,
      },
      { name: 'Dedicated fans', value: '` +0 ` ` +0 `', inline: false },
    ],
    author: {
      url: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670570',
    },
  });
}

export function matchEndWinMessage(): Message {
  return sampleMessage({
    title: ':checkered_flag:  End of the match',
    description: 'Winner Calavera Selvática FC in 3 hours and 30 minutes.',
    fields: [
      {
        name: '**CALAVERA SELVÁTICA FC**\n`1010` Amazon\n:flag_se: MichaelF',
        value: '`      2      `',
        inline: true,
      },
      {
        name: "**SATAN'S LITTLE HELPERS**\n`1120` Halfling\n:flag_se: Jens Rydholm",
        value: '`      1      `',
        inline: true,
      },
      {
        name: 'Total winnings',
        value: '` +65,000 ` ` +55,000 `',
        inline: false,
      },
      { name: 'Dedicated fans', value: '` +0 ` ` +0 `', inline: false },
    ],
    author: {
      url: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670571',
    },
  });
}

export function newSkillMessage(): Message {
  return sampleMessage({
    author: {
      name: 'New skill/characteristic',
      url: 'https://tourplay.net/en/blood-bowl/roster/167242',
    },
    fields: [
      {
        name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
        value: 'Random Primary ` Guard ` ` ★8 `',
        inline: false,
      },
    ],
    footer: { text: 'Rocket From The Tombs' },
  });
}

export function hiredMessage(): Message {
  return sampleMessage({
    author: {
      name: 'Hired',
      url: 'https://tourplay.net/en/blood-bowl/roster/167242',
    },
    fields: [
      {
        name: '`#3` Ragnfred Brownlock *(Halfling Hefty)*',
        value: '',
        inline: false,
      },
    ],
    footer: { text: "Satan's Little Helpers" },
  });
}

export function firedMessage(): Message {
  return sampleMessage({
    author: {
      name: 'Fired',
      url: 'https://tourplay.net/en/blood-bowl/roster/167242',
    },
    fields: [
      {
        name: '`#10` Helmut Cool *(Imperial Thrower)*',
        value: '',
        inline: false,
      },
    ],
    footer: { text: 'Bamberger Billy-Böbs' },
  });
}

/** Recognised but deliberately out of scope. */
export function matchScheduledMessage(): Message {
  return sampleMessage({
    title: ':calendar:  Match scheduled',
    fields: [
      {
        name: '**EVERVAIN EGRETS**\n`1400` High Elf\n:flag_se: Patrick M',
        value: '`      -      `',
        inline: true,
      },
    ],
    author: {
      url: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670572',
    },
  });
}

/** The generic in-match event embed — recognised, deliberately out of scope. */
export function matchEventMessage(): Message {
  return sampleMessage({
    author: {
      name: 'Match Event',
      url: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670570',
    },
    fields: [
      { name: '`#8` Phothara The Crimson', value: 'Touchdown', inline: false },
    ],
  });
}

/** A TP-shaped message of no known kind, to exercise the drift warning. */
export function unrecognizedMessage(): Message {
  return sampleMessage({
    title: ':tada:  League promotion',
    description: 'Something TP started posting that we have never seen.',
    fields: [],
    author: { name: 'League' },
  });
}

/** An ordinary human message in the source channel: not a candidate at all. */
export function nonWebhookMessage(): Message {
  return {
    id: SAMPLE_MESSAGE_ID,
    channelId: SAMPLE_CHANNEL_ID,
    webhookId: null,
    embeds: [],
  } as unknown as Message;
}
