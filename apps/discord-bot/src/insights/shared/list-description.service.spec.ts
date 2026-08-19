import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { ListDescriptionService } from './list-description.service';

describe('ListDescriptionService.build', () => {
  let service: ListDescriptionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ListDescriptionService],
    }).compile();
    service = moduleRef.get(ListDescriptionService);
  });

  // Long enough that 200 of them comfortably exceed MAX_DESCRIPTION_LENGTH.
  function longLines(): string[] {
    return Array.from(
      { length: 200 },
      (_unused, index) => `List entry number ${index} with a fairly long label`,
    );
  }

  it('joins the lines with newlines when nothing needs truncating', () => {
    expect(service.build(['first', 'second', 'third'], null)).toBe(
      'first\nsecond\nthird',
    );
  });

  it('returns an empty string for an empty line list with no overflow note', () => {
    expect(service.build([], null)).toBe('');
  });

  it('appends the overflow note on its own line when nothing needs truncating', () => {
    expect(
      service.build(['first', 'second'], '…and 3 more without a link.'),
    ).toBe('first\nsecond\n…and 3 more without a link.');
  });

  it('truncates to the Discord embed cap with an ellipsis when there is no overflow note', () => {
    const description = service.build(longLines(), null);

    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
    // The kept prefix is the real joined text, not a rewritten one.
    expect(
      description.startsWith('List entry number 0 with a fairly long label\n'),
    ).toBe(true);
  });

  it('preserves the overflow note in full when the lines must be truncated to fit', () => {
    // A plain end-of-string truncation would risk cutting the note itself off
    // — exactly the case where it matters most, since it only appears once the
    // catalog is already long enough to need one.
    const overflowNote = '…and 12345 more without a link.';

    const description = service.build(longLines(), overflowNote);

    expect(description.endsWith(`\n${overflowNote}`)).toBe(true);
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    // The truncated line block itself still ends in the ellipsis marker.
    expect(
      description
        .slice(0, description.length - overflowNote.length - 1)
        .endsWith('…'),
    ).toBe(true);
  });
});
