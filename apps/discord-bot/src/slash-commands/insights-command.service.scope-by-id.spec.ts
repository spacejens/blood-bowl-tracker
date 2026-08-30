import { describe, expect, it } from 'vitest';

import {
  INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
  INSIGHTS_ERA_NOT_FOUND_MESSAGE,
  INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE,
} from '../error-messages';
import { makeService } from './insights-command.service.test-helpers';

describe('InsightsCommandService — resolving a scope from an id', () => {
  it('resolves nothing to the all-time scope', async () => {
    const { service } = await makeService();
    await expect(service.resolveScopeById(null)).resolves.toEqual({
      kind: 'ok',
      resolved: {},
    });
  });

  it('resolves a league id to its name', async () => {
    const { service, leagues } = await makeService();
    leagues.findById.mockResolvedValue({ id: 5, name: 'GBBL' });
    await expect(
      service.resolveScopeById({ kind: 'league', id: 5 }),
    ).resolves.toEqual({
      kind: 'ok',
      resolved: { league: { id: 5, name: 'GBBL' } },
    });
    expect(leagues.findById).toHaveBeenCalledWith(5);
  });

  it('reports a league that no longer exists', async () => {
    const { service } = await makeService();
    await expect(
      service.resolveScopeById({ kind: 'league', id: 5 }),
    ).resolves.toEqual({
      kind: 'error',
      message: INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE,
    });
  });

  it('resolves an era id to its name', async () => {
    const { service, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 12, name: 'Era Twelve' });
    await expect(
      service.resolveScopeById({ kind: 'era', id: 12 }),
    ).resolves.toEqual({
      kind: 'ok',
      resolved: { era: { id: 12, name: 'Era Twelve' } },
    });
  });

  it('reports an era that no longer exists', async () => {
    const { service } = await makeService();
    await expect(
      service.resolveScopeById({ kind: 'era', id: 12 }),
    ).resolves.toEqual({
      kind: 'error',
      message: INSIGHTS_ERA_NOT_FOUND_MESSAGE,
    });
  });

  it('resolves a competition id to its name', async () => {
    const { service, competitions } = await makeService();
    competitions.findById.mockResolvedValue({ id: 7, name: 'Spike Cup' });
    await expect(
      service.resolveScopeById({ kind: 'competition', id: 7 }),
    ).resolves.toEqual({
      kind: 'ok',
      resolved: { competition: { id: 7, name: 'Spike Cup' } },
    });
  });

  it('reports a competition that no longer exists', async () => {
    const { service } = await makeService();
    await expect(
      service.resolveScopeById({ kind: 'competition', id: 7 }),
    ).resolves.toEqual({
      kind: 'error',
      message: INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
    });
  });

  it('labels a match category without any lookup that can fail', async () => {
    const { service, categoryLabel, leagues, eras, competitions } =
      await makeService();
    await expect(
      service.resolveScopeById({ kind: 'matchCategory', value: 'cup_final' }),
    ).resolves.toEqual({
      kind: 'ok',
      resolved: {
        matchCategory: { value: 'cup_final', label: 'Label for cup_final' },
      },
    });
    expect(categoryLabel.label).toHaveBeenCalledWith('cup_final');
    expect(leagues.findById).not.toHaveBeenCalled();
    expect(eras.findById).not.toHaveBeenCalled();
    expect(competitions.findById).not.toHaveBeenCalled();
  });
});
