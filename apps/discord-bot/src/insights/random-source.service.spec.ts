import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RandomSourceService } from './random-source.service';

describe('RandomSourceService', () => {
  let service: RandomSourceService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RandomSourceService],
    }).compile();
    service = moduleRef.get(RandomSourceService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the underlying random float', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(service.next()).toBe(0.25);
  });

  it('rolls true when the draw falls under the percentage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49);
    expect(service.rollPercent(50)).toBe(true);
  });

  it('rolls false when the draw lands on or above the percentage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(service.rollPercent(50)).toBe(false);
  });

  it('never rolls true at 0 percent and always rolls true at 100 percent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(service.rollPercent(0)).toBe(false);
    expect(service.rollPercent(100)).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(service.rollPercent(0)).toBe(false);
    expect(service.rollPercent(100)).toBe(true);
  });

  it('picks the element the draw lands on', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(service.pick(['a', 'b', 'c'])).toBe('a');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(service.pick(['a', 'b', 'c'])).toBe('b');
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(service.pick(['a', 'b', 'c'])).toBe('c');
  });
});
