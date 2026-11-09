import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicDisplayFormattingService } from './characteristic-display-formatting.service';

describe('CharacteristicDisplayFormattingService', () => {
  let service: CharacteristicDisplayFormattingService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicDisplayFormattingService],
    }).compile();
    service = moduleRef.get(CharacteristicDisplayFormattingService);
  });

  it('renders a bare characteristic as a plain number', () => {
    expect(service.format(7, 'bare')).toBe('7');
  });

  it('renders a plus characteristic with a trailing plus', () => {
    expect(service.format(3, 'plus')).toBe('3+');
  });

  it('renders a non-zero plus_zero_legal characteristic with a trailing plus', () => {
    expect(service.format(3, 'plus_zero_legal')).toBe('3+');
  });

  it('still renders a plus_zero_legal zero as a dash, by deliberate Discord convention', () => {
    // Zero is a legitimate "cannot pass" value in the database, but Discord
    // deliberately shows it the same as an absent value: a bare "0" reads
    // oddly to players. The review tools show the real 0 instead.
    expect(service.format(0, 'plus_zero_legal')).toBe('—');
  });

  it('renders a stored zero as a dash, whatever the format', () => {
    expect(service.format(0, 'bare')).toBe('—');
    expect(service.format(0, 'plus')).toBe('—');
  });

  it('renders a missing value as a dash, whatever the format', () => {
    expect(service.format(null, 'bare')).toBe('—');
    expect(service.format(null, 'plus')).toBe('—');
  });

  it('renders a negative value as-is rather than as a dash', () => {
    // Only zero is the not-yet-curated placeholder; nothing else is
    // special-cased, so an unexpected value shows itself rather than hiding.
    expect(service.format(-1, 'bare')).toBe('-1');
  });
});
