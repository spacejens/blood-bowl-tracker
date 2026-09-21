import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TpFeedParserService } from './tp-feed-parser.service';
import {
  firedMessage,
  hiredMessage,
  matchEndDrawMessage,
  matchEndWinMessage,
  matchEventMessage,
  matchScheduledMessage,
  matchStartMessage,
  newSkillMessage,
  nonWebhookMessage,
  sampleMessage,
  unrecognizedMessage,
} from './tp-feed-samples.test-helpers';

describe('TpFeedParserService', () => {
  let service: TpFeedParserService;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [TpFeedParserService],
    }).compile();
    service = moduleRef.get(TpFeedParserService);
  });

  it('parses a start of match notification', () => {
    expect(service.parse(matchStartMessage())).toEqual({
      kind: 'match-start',
      home: { name: 'EVERVAIN EGRETS', race: 'High Elf', coach: 'Patrick M' },
      away: {
        name: 'ROCKET FROM THE TOMBS',
        race: 'Tomb Kings',
        coach: 'Andreas Gunnarsson',
      },
      link: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670570',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses a drawn end of match notification', () => {
    expect(service.parse(matchEndDrawMessage())).toEqual({
      kind: 'match-end',
      home: { name: 'EVERVAIN EGRETS', race: 'High Elf', coach: 'Patrick M' },
      away: {
        name: 'ROCKET FROM THE TOMBS',
        race: 'Tomb Kings',
        coach: 'Andreas Gunnarsson',
      },
      homeScore: 0,
      awayScore: 0,
      outcome: 'draw',
      winnerName: null,
      link: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670570',
    });
  });

  it('parses a won end of match notification, including the winner name', () => {
    expect(service.parse(matchEndWinMessage())).toEqual({
      kind: 'match-end',
      home: {
        name: 'CALAVERA SELVÁTICA FC',
        race: 'Amazon',
        coach: 'MichaelF',
      },
      away: {
        name: "SATAN'S LITTLE HELPERS",
        race: 'Halfling',
        coach: 'Jens Rydholm',
      },
      homeScore: 2,
      awayScore: 1,
      outcome: 'win',
      winnerName: 'Calavera Selvática FC',
      link: 'https://tourplay.net/en/blood-bowl/tloeg-blood-bowl-league-sasong-31/match/670571',
    });
  });

  it('parses a new skill/characteristic notification', () => {
    expect(service.parse(newSkillMessage())).toEqual({
      kind: 'new-skill-or-characteristic',
      playerNumber: '8',
      playerName: 'Phothara The Crimson',
      position: 'Tomb Guardian',
      teamName: 'Rocket From The Tombs',
      description: 'Random Primary Guard ★8',
      link: 'https://tourplay.net/en/blood-bowl/roster/167242',
    });
  });

  it('parses a hired notification', () => {
    expect(service.parse(hiredMessage())).toEqual({
      kind: 'hired',
      playerNumber: '3',
      playerName: 'Ragnfred Brownlock',
      position: 'Halfling Hefty',
      teamName: "Satan's Little Helpers",
      link: 'https://tourplay.net/en/blood-bowl/roster/167242',
    });
  });

  it('parses a fired notification', () => {
    expect(service.parse(firedMessage())).toEqual({
      kind: 'fired',
      playerNumber: '10',
      playerName: 'Helmut Cool',
      position: 'Imperial Thrower',
      teamName: 'Bamberger Billy-Böbs',
      link: 'https://tourplay.net/en/blood-bowl/roster/167242',
    });
  });

  it('ignores a match scheduled notification without warning', () => {
    expect(service.parse(matchScheduledMessage())).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores an in-match event notification without warning', () => {
    expect(service.parse(matchEventMessage())).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores a non-webhook message without warning', () => {
    expect(service.parse(nonWebhookMessage())).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('ignores a webhook message with no embeds without warning', () => {
    const message = { id: 'x', webhookId: 'w', embeds: [] } as never;
    expect(service.parse(message)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns with a diagnosable excerpt for an unrecognized shape', () => {
    expect(service.parse(unrecognizedMessage())).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unrecognized TP notification'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(':tada:  League promotion'),
    );
  });

  it('warns and returns null when a team field is malformed', () => {
    const message = sampleMessage({
      title: ':football:  1 min - Start of match',
      fields: [
        { name: '**ONLY ONE LINE**', value: '`      0      `', inline: true },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1575` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-start'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('home team field'),
    );
  });

  it('warns and returns null when the away team field is missing', () => {
    const message = sampleMessage({
      title: ':football:  1 min - Start of match',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1400` High Elf\n:flag_se: Patrick M',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('away team field'),
    );
  });

  it('warns and returns null when a start of match has no link', () => {
    const message = sampleMessage({
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
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('author.url'));
  });

  it('warns and returns null when a score is not a number', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Draw in 1 hour.',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1290` High Elf\n:flag_se: Patrick M',
          value: '`      -      `',
          inline: true,
        },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1650` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('home score'));
  });

  it('warns and returns null when the away score is not a number', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Draw in 1 hour.',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1290` High Elf\n:flag_se: Patrick M',
          value: '`      0      `',
          inline: true,
        },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1650` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      x      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('away score'));
  });

  it('warns and returns null when an end of match outcome is unreadable', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Abandoned after 10 minutes.',
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
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('description'));
  });

  it('warns and returns null when a player field does not match', () => {
    const message = sampleMessage({
      author: {
        name: 'Hired',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [{ name: 'Ragnfred Brownlock', value: '', inline: false }],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('player field'));
  });

  it('warns and returns null when the team footer is missing', () => {
    const message = sampleMessage({
      author: {
        name: 'Fired',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: '`#10` Helmut Cool *(Imperial Thrower)*',
          value: '',
          inline: false,
        },
      ],
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('footer.text'));
  });

  it('warns and returns null when a hire notification has no link', () => {
    const message = sampleMessage({
      author: { name: 'Hired' },
      fields: [
        {
          name: '`#3` Ragnfred Brownlock *(Halfling Hefty)*',
          value: '',
          inline: false,
        },
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('author.url'));
  });

  it('warns and returns null when a skill notification has an empty description', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
          value: '  ` `  ',
          inline: false,
        },
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('field value'));
  });

  // Gap 1: parseMatchEnd home team field failure
  it('warns and returns null when an end of match has a malformed home team field', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Draw in 1 hour.',
      fields: [
        { name: '**ONLY ONE LINE**', value: '`      0      `', inline: true },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1575` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-end'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('home team field'),
    );
  });

  // Gap 1: parseMatchEnd away team field failure
  it('warns and returns null when an end of match has a malformed away team field', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Draw in 1 hour.',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1290` High Elf\n:flag_se: Patrick M',
          value: '`      0      `',
          inline: true,
        },
        { name: '**MISSING LINES**', value: '`      0      `', inline: true },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-end'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('away team field'),
    );
  });

  // Gap 2: parseMatchEnd missing author.url
  it('warns and returns null when an end of match has no link', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
      description: 'Draw in 1 hour.',
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
      ],
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-end'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('author.url'));
  });

  // Gap 3: parseNewSkillOrCharacteristic malformed player field
  it('warns and returns null when a skill notification has a malformed player field', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: 'Phothara The Crimson',
          value: 'Random Primary Guard',
          inline: false,
        },
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('new-skill'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('player field'));
  });

  // Gap 3: parseNewSkillOrCharacteristic missing footer
  it('warns and returns null when a skill notification has no team footer', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
          value: 'Random Primary Guard',
          inline: false,
        },
      ],
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('new-skill'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('footer.text'));
  });

  // Gap 3: parseNewSkillOrCharacteristic missing link
  it('warns and returns null when a skill notification has no link', () => {
    const message = sampleMessage({
      author: { name: 'New skill/characteristic' },
      fields: [
        {
          name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
          value: 'Random Primary Guard',
          inline: false,
        },
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('new-skill'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('author.url'));
  });

  // Gap 4: parseTeamField with empty race line
  it('warns and returns null when a team field has an empty race line', () => {
    const message = sampleMessage({
      title: ':football:  1 min - Start of match',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1400` \n:flag_se: Patrick M',
          value: '`      0      `',
          inline: true,
        },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1575` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-start'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('home team field'),
    );
  });

  // Gap 4: parseTeamField with empty coach line
  it('warns and returns null when a team field has an empty coach line', () => {
    const message = sampleMessage({
      title: ':football:  1 min - Start of match',
      fields: [
        {
          name: '**EVERVAIN EGRETS**\n`1400` High Elf\n:flag_se: ',
          value: '`      0      `',
          inline: true,
        },
        {
          name: '**ROCKET FROM THE TOMBS**\n`1575` Tomb Kings\n:flag_se: Andreas Gunnarsson',
          value: '`      0      `',
          inline: true,
        },
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('match-start'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('home team field'),
    );
  });

  // Gap 5: parseSkillDescription with undefined value (via parseNewSkillOrCharacteristic)
  it('returns empty string from parseSkillDescription when field value is undefined', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
          value: '',
          inline: false,
        },
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('field value'));
  });

  // Gap 5: describe() with undefined embed fields
  it('includes "(none)" placeholders in describe() for undefined fields', () => {
    const message = sampleMessage({
      fields: [],
      author: {},
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('title=(none)'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('author.name=(none)'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('description=(none)'),
    );
  });

  // Line 105: parseMatchEnd description ?? '' fallback
  it('uses default empty string when match end description is undefined', () => {
    const message = sampleMessage({
      title: ':checkered_flag:  End of the match',
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
      ],
      author: { url: 'https://tourplay.net/en/blood-bowl/match/1' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('description'));
  });

  // Line 163: parsePlayerField name ? ... : undefined fallback (when name is undefined)
  it('returns null when player field is missing entirely', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('player field'));
  });

  // Line 185: parseSkillDescription value ?? '' fallback (when value is undefined)
  it('handles skill notification with missing field value', () => {
    const message = sampleMessage({
      author: {
        name: 'New skill/characteristic',
        url: 'https://tourplay.net/en/blood-bowl/roster/1',
      },
      fields: [
        {
          name: '`#8` Phothara The Crimson *(Tomb Guardian)*',
          inline: false,
        } as never,
      ],
      footer: { text: 'Some Team' },
    });

    expect(service.parse(message)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('field value'));
  });
});
