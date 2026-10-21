import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NumberFormatterService } from './number-formatter.service';

describe('NumberFormatterService', () => {
  let service: NumberFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NumberFormatterService],
    }).compile();
    service = moduleRef.get(NumberFormatterService);
  });

  describe('count', () => {
    it.each([
      [0, '0'],
      [1, '1'],
      [2, '2'],
      [999, '999'],
      [1000, '1,000'],
      [1234567, '1,234,567'],
      [-1234, '-1,234'],
    ])('renders %d as %s', (n, expected) => {
      expect(service.count(n)).toBe(expected);
    });
  });

  describe('counted', () => {
    it.each([
      [0, '0 days'],
      [1, '1 day'],
      [2, '2 days'],
      [999, '999 days'],
      [1000, '1,000 days'],
      [-1, '-1 day'],
      [-2, '-2 days'],
    ])('renders %d with the regular plural as %s', (n, expected) => {
      expect(service.counted(n, 'day')).toBe(expected);
    });

    it('uses an explicit plural for irregular nouns', () => {
      expect(service.counted(1, 'injury', 'injuries')).toBe('1 injury');
      expect(service.counted(3, 'injury', 'injuries')).toBe('3 injuries');
      expect(service.counted(1234, 'injury', 'injuries')).toBe(
        '1,234 injuries',
      );
    });
  });
});
