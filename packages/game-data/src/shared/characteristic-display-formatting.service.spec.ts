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
