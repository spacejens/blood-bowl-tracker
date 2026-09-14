import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StarPlayerNameMatcherService } from './star-player-name-matcher.service';

describe('StarPlayerNameMatcherService', () => {
  let service: StarPlayerNameMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [StarPlayerNameMatcherService],
    }).compile();
    service = moduleRef.get(StarPlayerNameMatcherService);
  });

  it('treats curly and straight apostrophes as the same name', () => {
    expect(service.matchesName("Boa Kon'ssstriktr", 'Boa Kon’ssstriktr')).toBe(
      true,
    );
  });

  it('ignores case and collapses whitespace', () => {
    expect(service.matchesName('  Grim   Ironjaw ', 'grim ironjaw')).toBe(true);
  });

  it('treats a BBL duo suffix as the same star', () => {
    expect(
      service.matchesName('Dolfar Longstride (& Grak)', 'Dolfar Longstride'),
    ).toBe(true);
  });

  it('does not match two genuinely different stars', () => {
    expect(service.matchesName('Griff Oberwald', 'Grim Ironjaw')).toBe(false);
  });

  it('matches an external-id reference against the owned ids', () => {
    expect(
      service.refMatches({ system: 'Name', id: 'Griff Oberwald' }, [
        { systemName: 'Name', externalId: 'Griff Oberwald' },
      ]),
    ).toBe(true);
  });

  it('rejects a reference whose system differs', () => {
    expect(
      service.refMatches({ system: 'tourplay.net', id: 'Griff Oberwald' }, [
        { systemName: 'Name', externalId: 'Griff Oberwald' },
      ]),
    ).toBe(false);
  });
});
