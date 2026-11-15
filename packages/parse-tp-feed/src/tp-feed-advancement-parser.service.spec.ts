import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpFeedAdvancementParserService } from './tp-feed-advancement-parser.service';
import type { TpFeedEmbedLike } from './tp-feed-embed';

const ROSTER_LINK = 'https://tourplay.net/en/blood-bowl/roster/167242';
const PLAYER_LINE = '`#6` Grimgor Ironhide *(Black Orc)*';

/** A TP advancement embed with the given first-field value. */
function advancementEmbed(
  value: string | undefined,
  overrides: Partial<TpFeedEmbedLike> = {},
): TpFeedEmbedLike {
  return {
    author: { name: 'New skill/characteristic', url: ROSTER_LINK },
    fields: [{ name: PLAYER_LINE, value }],
    footer: { text: 'Rocket From The Tombs' },
    ...overrides,
  };
}

const PLAYER = {
  playerNumber: '6',
  playerName: 'Grimgor Ironhide',
  position: 'Black Orc',
  teamName: 'Rocket From The Tombs',
  rosterLink: ROSTER_LINK,
};

describe('TpFeedAdvancementParserService', () => {
  let service: TpFeedAdvancementParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpFeedAdvancementParserService],
    }).compile();
    service = moduleRef.get(TpFeedAdvancementParserService);
  });

  describe('parse', () => {
    it('parses a random characteristic gain', () => {
      const rawValue = 'Random Characteristics ` +1 AG ` ` ★16 `';

      expect(service.parse(advancementEmbed(rawValue))).toEqual({
        ok: true,
        advancement: {
          ...PLAYER,
          selection: 'random',
          category: 'characteristics',
          gain: { characteristic: 'AG', delta: 1 },
          sppCost: 16,
          valueText: 'Random Characteristics +1 AG ★16',
          rawValue,
        },
      });
    });

    it('parses a chosen primary skill', () => {
      const rawValue = 'Primary ` Block ` ` ★16 `';

      expect(service.parse(advancementEmbed(rawValue))).toEqual({
        ok: true,
        advancement: {
          ...PLAYER,
          selection: 'chosen',
          category: 'primary',
          gain: { skill: 'Block' },
          sppCost: 16,
          valueText: 'Primary Block ★16',
          rawValue,
        },
      });
    });

    it('parses a random primary skill', () => {
      const result = service.parse(
        advancementEmbed('Random Primary ` Wrestle ` ` ★3 `'),
      );

      expect(result).toMatchObject({
        ok: true,
        advancement: {
          selection: 'random',
          category: 'primary',
          gain: { skill: 'Wrestle' },
          sppCost: 3,
        },
      });
    });

    it('parses a secondary skill whose name has several words', () => {
      const result = service.parse(
        advancementEmbed('Secondary ` Mighty Blow ` ` ★12 `'),
      );

      expect(result).toMatchObject({
        ok: true,
        advancement: {
          selection: 'chosen',
          category: 'secondary',
          gain: { skill: 'Mighty Blow' },
          sppCost: 12,
        },
      });
    });

    it.each([
      ['-1 MA', 'MA', -1],
      ['+1 PA', 'PA', 1],
      ['+1 AV', 'AV', 1],
    ] as const)(
      'parses the characteristic change %s',
      (text, characteristic, delta) => {
        const result = service.parse(
          advancementEmbed(`Random Characteristics \` ${text} \` \` ★16 \``),
        );

        expect(result).toMatchObject({
          ok: true,
          advancement: { gain: { characteristic, delta } },
        });
      },
    );

    it('keeps the category and cost but no gain for a characteristic it does not know', () => {
      const result = service.parse(
        advancementEmbed('Random Characteristics ` +1 XY ` ` ★16 `'),
      );

      expect(result).toMatchObject({
        ok: true,
        advancement: {
          selection: 'random',
          category: 'characteristics',
          gain: null,
          sppCost: 16,
        },
      });
    });

    it('still parses a value whose wording it does not understand, with nothing derived from it', () => {
      const result = service.parse(advancementEmbed('Something ` new `'));

      expect(result).toEqual({
        ok: true,
        advancement: {
          ...PLAYER,
          selection: null,
          category: null,
          gain: null,
          sppCost: null,
          valueText: 'Something new',
          rawValue: 'Something ` new `',
        },
      });
    });

    it('fails on the player field when it does not match', () => {
      const embed = advancementEmbed('Primary ` Block ` ` ★16 `', {
        fields: [{ name: 'Grimgor Ironhide', value: 'Primary Block' }],
      });

      expect(service.parse(embed)).toEqual({
        ok: false,
        failedField: 'player field',
      });
    });

    it('fails on the player field when there are no fields', () => {
      expect(
        service.parse(advancementEmbed(undefined, { fields: [] })),
      ).toEqual({ ok: false, failedField: 'player field' });
    });

    it('fails on the player field when fields are absent altogether', () => {
      expect(
        service.parse(advancementEmbed(undefined, { fields: undefined })),
      ).toEqual({ ok: false, failedField: 'player field' });
    });

    it('fails on the footer when the team name is missing', () => {
      expect(
        service.parse(advancementEmbed('Primary ` Block `', { footer: null })),
      ).toEqual({ ok: false, failedField: 'footer.text' });
    });

    it('fails on the author url when the roster link is missing', () => {
      const embed = advancementEmbed('Primary ` Block `', {
        author: { name: 'New skill/characteristic' },
      });

      expect(service.parse(embed)).toEqual({
        ok: false,
        failedField: 'author.url',
      });
    });

    it('fails on the author url when there is no author', () => {
      expect(
        service.parse(advancementEmbed('Primary ` Block `', { author: null })),
      ).toEqual({ ok: false, failedField: 'author.url' });
    });

    it('fails on the field value when it is only backticks and whitespace', () => {
      expect(service.parse(advancementEmbed('  ` `  '))).toEqual({
        ok: false,
        failedField: 'field value',
      });
    });

    it('fails on the field value when it is missing', () => {
      expect(service.parse(advancementEmbed(undefined))).toEqual({
        ok: false,
        failedField: 'field value',
      });
    });
  });

  describe('parsePlayerLine', () => {
    it('splits the number, name and position', () => {
      expect(service.parsePlayerLine(PLAYER_LINE)).toEqual({
        playerNumber: '6',
        playerName: 'Grimgor Ironhide',
        position: 'Black Orc',
      });
    });

    it('returns null for a line of another shape', () => {
      expect(service.parsePlayerLine('Grimgor Ironhide')).toBeNull();
    });

    it('returns null for a missing line', () => {
      expect(service.parsePlayerLine(undefined)).toBeNull();
    });
  });
});
