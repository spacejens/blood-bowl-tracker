import { describe, expect, it } from 'vitest';

import { PLAYER_CHARACTERISTICS } from './player-characteristics';

describe('PLAYER_CHARACTERISTICS', () => {
  it('lists the five characteristics in stat-line order', () => {
    expect(PLAYER_CHARACTERISTICS).toEqual(['MA', 'ST', 'AG', 'PA', 'AV']);
  });
});
