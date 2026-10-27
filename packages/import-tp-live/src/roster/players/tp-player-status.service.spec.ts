import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpPlayerStatusInput } from './tp-player-status.service';
import { TpPlayerStatusService } from './tp-player-status.service';

describe('TpPlayerStatusService', () => {
  let service: TpPlayerStatusService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpPlayerStatusService],
    }).compile();
    service = moduleRef.get(TpPlayerStatusService);
  });

  const activeInput: TpPlayerStatusInput = { state: 1, isActive: true };

  it.each<[string, TpPlayerStatusInput, PlayerStatus | null]>([
    ['bit 8 as dead', { state: 8, isActive: false }, 'dead'],
    ['bit 16 as retired', { state: 16, isActive: false }, 'retired'],
    [
      'bit 8192 as temporarily retired',
      { state: 8192, isActive: true },
      'temporarily_retired',
    ],
    [
      'bit 8192 on an inactive player as temporarily retired',
      { state: 8192, isActive: false },
      'temporarily_retired',
    ],
  ])('reads %s', (_label, input, expected) => {
    expect(service.forPlayer(input)).toBe(expected);
  });

  it('prefers dead over retired and temporarily retired', () => {
    expect(service.forPlayer({ state: 8 + 16 + 8192, isActive: false })).toBe(
      'dead',
    );
  });

  it('prefers retired over temporarily retired', () => {
    expect(service.forPlayer({ state: 16 + 8192 + 1, isActive: false })).toBe(
      'retired',
    );
  });

  it('reads the real temporarily retired roster player (state 12289, active)', () => {
    expect(service.forPlayer({ state: 12289, isActive: true })).toBe(
      'temporarily_retired',
    );
  });

  it('reads a status bit even on a player still flagged active', () => {
    expect(service.forPlayer({ ...activeInput, state: 8 })).toBe('dead');
  });

  it('reads an active player with no status bit as active', () => {
    expect(service.forPlayer(activeInput)).toBe('active');
  });

  it('reads an active player with state 4096 as active', () => {
    expect(service.forPlayer({ state: 4096, isActive: true })).toBe('active');
  });

  it('ignores bits with no known status meaning', () => {
    expect(service.forPlayer({ ...activeInput, state: 4096 + 1 })).toBe(
      'active',
    );
  });

  it('reads a player flagged inactive with no status bit as retired', () => {
    expect(service.forPlayer({ ...activeInput, isActive: false })).toBe(
      'retired',
    );
  });

  it('reads the real departed player with an unknown bit (state 4100, inactive) as retired', () => {
    expect(service.forPlayer({ state: 4100, isActive: false })).toBe('retired');
  });

  it('reads an inactive player with no state as retired', () => {
    expect(service.forPlayer({ state: undefined, isActive: false })).toBe(
      'retired',
    );
  });

  it('does not let an inactive flag override the dead bit', () => {
    expect(service.forPlayer({ state: 8 + 4, isActive: false })).toBe('dead');
  });

  it('reads a player with no isActive flag as unknown', () => {
    expect(
      service.forPlayer({ ...activeInput, isActive: undefined }),
    ).toBeNull();
  });

  it('reads an active player with no state as active', () => {
    expect(service.forPlayer({ ...activeInput, state: undefined })).toBe(
      'active',
    );
  });

  it('reads a player with neither field as unknown', () => {
    expect(
      service.forPlayer({ state: undefined, isActive: undefined }),
    ).toBeNull();
  });
});
