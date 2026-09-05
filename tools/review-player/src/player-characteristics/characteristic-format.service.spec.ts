import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CharacteristicFormatService } from './characteristic-format.service';

async function makeService(): Promise<CharacteristicFormatService> {
  const moduleRef = await Test.createTestingModule({
    providers: [CharacteristicFormatService],
  }).compile();
  return moduleRef.get(CharacteristicFormatService);
}

describe('CharacteristicFormatService', () => {
  it('renders a bare value as the plain number', async () => {
    const service = await makeService();
    expect(service.format(3, 'bare')).toBe('3');
  });

  it('renders a plus value with a trailing "+"', async () => {
    const service = await makeService();
    expect(service.format(3, 'plus')).toBe('3+');
  });

  it('renders an absent value as the none marker regardless of the number', async () => {
    const service = await makeService();
    expect(service.format(3, 'absent')).toBe('—');
  });

  it('renders a null bare value as the none marker', async () => {
    const service = await makeService();
    expect(service.format(null, 'bare')).toBe('—');
  });

  it('renders a null plus value as the none marker', async () => {
    const service = await makeService();
    expect(service.format(null, 'plus')).toBe('—');
  });

  it('renders a bare zero as a real value, not as the none marker', async () => {
    const service = await makeService();
    // Review tools exist to show what the data actually says, so a stored 0
    // is printed rather than hidden — matching tools/review-race.
    expect(service.format(0, 'bare')).toBe('0');
  });

  it('renders a plus zero as "0+", showing the data as stored', async () => {
    const service = await makeService();
    // Under plain `plus`, 0 is not a legal value, so "0+" is exactly the
    // oddity a reviewer needs to see rather than have hidden behind a dash.
    expect(service.format(0, 'plus')).toBe('0+');
  });

  it('renders a non-zero plus_zero_legal value with a trailing "+"', async () => {
    const service = await makeService();
    expect(service.format(3, 'plus_zero_legal')).toBe('3+');
  });

  it('renders a plus_zero_legal zero as a bare "0", never "0+"', async () => {
    const service = await makeService();
    // Here 0 is a real value ("structurally cannot pass") and "0+" is not a
    // meaningful die-roll target.
    expect(service.format(0, 'plus_zero_legal')).toBe('0');
  });

  it('renders a null plus_zero_legal value as the none marker', async () => {
    const service = await makeService();
    expect(service.format(null, 'plus_zero_legal')).toBe('—');
  });
});
