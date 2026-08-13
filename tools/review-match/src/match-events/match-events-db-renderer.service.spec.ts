import { DB } from '@blood-bowl-tracker/db';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { SampledMatch } from '../shared/review.types';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';

const match: SampledMatch = {
  source: 'bbl',
  matchId: 11,
  externalId: '1830',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal',
  selectedFor: ['Contains a foul'],
};

/** Only the fields a test cares about; the rest default to null. */
function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    actionType: null,
    consequenceType: null,
    eventType: null,
    actingPlayerName: null,
    actingTeamName: null,
    consequencePlayerName: null,
    consequenceTeamName: null,
    actingUnidentifiedKind: null,
    consequenceUnidentifiedKind: null,
    consequenceAvoidedBy: null,
    consequenceAvoidedSeverity: null,
    weatherType: null,
    secretObjective: null,
    inducementsCost: null,
    inducementsFromTreasury: null,
    winnings: null,
    fanFactor: null,
    journeymenCount: null,
    prayersToNuffle: null,
    dedicatedFans: null,
    expensiveMistake: null,
    ...overrides,
  };
}

async function makeService(
  dbResult: MockDbResult,
): Promise<MatchEventsDbRendererService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchEventsDbRendererService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(MatchEventsDbRendererService);
}

describe('MatchEventsDbRendererService', () => {
  it('renders one row per imported event with its core fields', async () => {
    const dbResult = mockDb(
      [
        eventRow({
          actionType: 'foul',
          actingPlayerName: 'Betong Bengt',
          actingTeamName: 'Bräkenäs Betongbockar',
        }),
      ],
      [{ matchEventId: 501, externalIds: ['bbl-1830-1'] }],
    );
    const service = await makeService(dbResult);

    const html = await service.render(match);

    expect(html).toContain('<th>Action /<br>Consequence</th>');
    expect(html).toContain('<td>foul<br>—</td>');
    expect(html).toContain('<td>Betong Bengt</td>');
    // Non-ASCII letters are not escaped — HtmlService only escapes & < > " '.
    expect(html).toContain('<td>Bräkenäs Betongbockar</td>');
    expect(html).toContain('<td>bbl-1830-1</td>');
    expect(html).toContain('<td>501</td>');
  });

  it('stacks every external id an event has in the External ID column', async () => {
    const dbResult = mockDb(
      [eventRow({ id: 501, actionType: 'death', consequenceType: 'death' })],
      [
        {
          matchEventId: 501,
          externalIds: ['89-awy-death-0', '89-hme-death-0'],
        },
      ],
    );
    const service = await makeService(dbResult);

    const html = await service.render(match);

    // One row, both ids — not one row per id.
    expect(html).toContain('<td>89-awy-death-0<br>89-hme-death-0</td>');
    expect(html.match(/<tr><td>501</g) ?? []).toHaveLength(1);
  });

  it('renders an em dash when an event has no external id for this system', async () => {
    const dbResult = mockDb(
      [eventRow({ id: 501 })],
      [{ matchEventId: 999, externalIds: ['bbl-1830-9'] }],
    );
    const service = await makeService(dbResult);

    const html = await service.render(match);

    expect(html).toContain('<td>501</td><td>—</td>');
    expect(html).not.toContain('bbl-1830-9');
  });

  it('renders an em dash for fields the event does not have', async () => {
    const service = await makeService(
      mockDb([eventRow({ eventType: 'weather' })]),
    );

    const html = await service.render(match);

    expect(html).toContain('<td>weather</td>');
    expect(html).toContain('<td>—</td>');
  });

  it('lists the remaining non-null scalar fields in the details column', async () => {
    const service = await makeService(
      mockDb([
        eventRow({
          eventType: 'weather',
          weatherType: 'nice',
          winnings: 60000,
        }),
      ]),
    );

    const html = await service.render(match);

    expect(html).toContain('weather=nice');
    expect(html).toContain('winnings=60000');
  });

  it('reports unidentified participants and avoided casualties in details', async () => {
    const service = await makeService(
      mockDb([
        eventRow({
          consequenceType: 'casualty_avoided',
          consequenceAvoidedBy: 'apothecary',
          consequenceAvoidedSeverity: 'badly_hurt',
          consequenceUnidentifiedKind: 'journeyman',
        }),
      ]),
    );

    const html = await service.render(match);

    expect(html).toContain('avoided_by=apothecary');
    expect(html).toContain('avoided_severity=badly_hurt');
    expect(html).toContain('consequence_unidentified=journeyman');
  });

  it('renders a note instead of a table when the match has no imported events', async () => {
    const service = await makeService(mockDb([]));

    const html = await service.render(match);

    expect(html).toBe(
      '<p class="note">No match events imported for this match.</p>',
    );
  });

  it("queries only this match's events", async () => {
    const dbResult = mockDb([eventRow()]);
    const service = await makeService(dbResult);

    await service.render(match);

    expect(dbResult.chains[0].where).toHaveBeenCalledTimes(1);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalledTimes(1);
  });
});
