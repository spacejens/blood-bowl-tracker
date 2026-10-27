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

  const listedActive: TpPlayerStatusInput = {
    state: 1,
    isActive: true,
    listed: true,
  };

  it.each<[string, TpPlayerStatusInput, PlayerStatus | null]>([
    ['bit 8 as dead', { state: 8, isActive: false, listed: false }, 'dead'],
    [
      'bit 16 as retired',
      { state: 16, isActive: false, listed: false },
      'retired',
    ],
    [
      'bit 8192 as temporarily retired',
      { state: 8192, isActive: true, listed: true },
      'temporarily_retired',
    ],
    [
      'bit 8192 on an unlisted inactive player as temporarily retired',
      { state: 8192, isActive: false, listed: false },
      'temporarily_retired',
    ],
  ])('reads %s', (_label, input, expected) => {
    expect(service.forPlayer(input)).toBe(expected);
  });

  it('prefers dead over retired and temporarily retired', () => {
    expect(
      service.forPlayer({
        state: 8 + 16 + 8192,
        isActive: false,
        listed: false,
      }),
    ).toBe('dead');
  });

  it('prefers retired over temporarily retired', () => {
    expect(
      service.forPlayer({
        state: 16 + 8192 + 1,
        isActive: false,
        listed: false,
      }),
    ).toBe('retired');
  });

  it('reads the real temporarily retired roster player (state 12289, listed, active)', () => {
    expect(
      service.forPlayer({ state: 12289, isActive: true, listed: true }),
    ).toBe('temporarily_retired');
  });

  it('reads a status bit even on a player still flagged active and listed', () => {
    expect(service.forPlayer({ ...listedActive, state: 8 })).toBe('dead');
  });

  it('reads a listed, active player with no status bit as active', () => {
    expect(service.forPlayer(listedActive)).toBe('active');
  });

  it('ignores bits with no known status meaning', () => {
    expect(service.forPlayer({ ...listedActive, state: 4096 + 1 })).toBe(
      'active',
    );
  });

  it('reads a listed player flagged inactive as unknown', () => {
    expect(service.forPlayer({ ...listedActive, isActive: false })).toBeNull();
  });

  it('reads a listed player with no isActive flag as unknown', () => {
    expect(
      service.forPlayer({ ...listedActive, isActive: undefined }),
    ).toBeNull();
  });

  it('never reads a snapshot-only player as active', () => {
    expect(service.forPlayer({ ...listedActive, listed: false })).toBeNull();
  });

  it('reads a snapshot-only inactive player with no status bit as unknown', () => {
    expect(
      service.forPlayer({ state: 1, isActive: false, listed: false }),
    ).toBeNull();
  });

  it('reads a status bit on a snapshot-only player', () => {
    expect(
      service.forPlayer({ state: 8192 + 16, isActive: false, listed: false }),
    ).toBe('retired');
  });

  it('reads a listed active player with no state as active', () => {
    expect(service.forPlayer({ ...listedActive, state: undefined })).toBe(
      'active',
    );
  });

  it('reads a snapshot-only player with no state as unknown', () => {
    expect(
      service.forPlayer({ state: undefined, isActive: true, listed: false }),
    ).toBeNull();
  });

  it('reads a snapshot-only player with neither field as unknown', () => {
    expect(
      service.forPlayer({
        state: undefined,
        isActive: undefined,
        listed: false,
      }),
    ).toBeNull();
  });
});
