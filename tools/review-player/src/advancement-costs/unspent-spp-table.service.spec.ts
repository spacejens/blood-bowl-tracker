import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UnspentSppModel } from './advancement-cost-model.types';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import type { UnspentSppTableInput } from './unspent-spp-table.service';
import { UnspentSppTableService } from './unspent-spp-table.service';

const MODEL: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: [],
  totalSpp: 40,
  range: { spentMin: 7, spentMax: 38, unspentMin: 2, unspentMax: 33 },
  unknownReason: null,
};

const BBL_FIGURE: SourceUnspentSppFigure = {
  source: 'bbl',
  unspentLabel: 'BBL Unspent SPP',
  unspent: 20,
  totalLabel: 'BBL career SPP (bracketed)',
  reportedTotal: 40,
  spendLabel: 'BBL spent SPP',
};

function input(
  overrides: Partial<UnspentSppTableInput> = {},
): UnspentSppTableInput {
  return {
    model: MODEL,
    figure: BBL_FIGURE,
    compared: { kind: 'compared', reportedSpend: 20, placement: 'inside' },
    stored: {
      kind: 'stored',
      stored: 20,
      placement: 'inside',
      source: 'matches',
      sourceUnspent: 20,
    },
    storedDisagrees: false,
    ...overrides,
  };
}

describe('UnspentSppTableService', () => {
  let service: UnspentSppTableService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UnspentSppTableService, HtmlService],
    }).compile();
    service = moduleRef.get(UnspentSppTableService);
  });

  it('shows the modelled ranges, the source figures and the stored figure', () => {
    const html = service.render(input());

    expect(html).toContain('<h5>Unspent SPP</h5>');
    expect(html).toContain('<td>Modelled spend</td><td>7 to 38</td>');
    expect(html).toContain('<td>Modelled unspent</td><td>2 to 33</td>');
    expect(html).toContain('<td>BBL career SPP (bracketed)</td><td>40</td>');
    expect(html).toContain('<td>BBL Unspent SPP</td><td>20</td>');
    expect(html).toContain(
      '<td>BBL spent SPP</td><td>20 (inside the modelled spend range)</td>',
    );
    expect(html).toContain(
      '<td>Stored unspent SPP</td><td>20 (inside the modelled unspent range; ' +
        'matches the source figure)</td>',
    );
    expect(html).not.toContain('Stored total SPP');
    expect(html).not.toContain('class="mismatch');
  });

  it('carries none of the always-on explanations', () => {
    const html = service.render(input());

    expect(html).not.toContain('Holding unspent SPP is normal');
    expect(html).not.toContain('<p');
  });

  it('explains a history gap only on a spend above the range', () => {
    const above = service.render(
      input({
        compared: { kind: 'compared', reportedSpend: 45, placement: 'above' },
      }),
    );
    const below = service.render(
      input({
        compared: { kind: 'compared', reportedSpend: 2, placement: 'below' },
      }),
    );

    expect(above).toContain(
      '<td class="mismatch-cell">45 — outside the modelled spend range ' +
        '(above it; a gap in the recorded advancement history can explain ' +
        'a spend above the range)</td>',
    );
    expect(below).toContain(
      '<td class="mismatch-cell">2 — outside the modelled spend range (below it)</td>',
    );
    expect(below).not.toContain('gap in the recorded advancement history');
  });

  it('says in the row, not a paragraph, when the spend is not compared', () => {
    const html = service.render(
      input({ compared: { kind: 'not_compared', reportedSpend: 20 } }),
    );

    expect(html).toContain(
      '<td>BBL spent SPP</td><td>20 (not compared under this rules set)</td>',
    );
    expect(html).not.toContain('BBL prices every player at BB2020 costs');
  });

  it('shows a dash spend when either source figure is missing', () => {
    const html = service.render(
      input({
        figure: { ...BBL_FIGURE, unspent: null },
        compared: { kind: 'none' },
      }),
    );

    expect(html).toContain('<td>BBL Unspent SPP</td><td>—</td>');
    expect(html).toContain('<td>BBL spent SPP</td><td>—</td>');
  });

  it('works out the spend when nothing was compared but both figures exist', () => {
    const html = service.render(input({ compared: { kind: 'none' } }));

    expect(html).toContain('<td>BBL spent SPP</td><td>20</td>');
  });

  it('says so when no source figure was read', () => {
    const html = service.render(
      input({ figure: null, compared: { kind: 'none' } }),
    );

    expect(html).toContain('<td>Source figures</td><td>none read</td>');
  });

  it('highlights a disagreeing stored figure with its possible-gap explanation', () => {
    const html = service.render(
      input({
        stored: {
          kind: 'stored',
          stored: 40,
          placement: 'above',
          source: 'differs',
          sourceUnspent: 20,
        },
        storedDisagrees: true,
      }),
    );

    expect(html).toContain(
      '<tr class="mismatch"><td>Stored unspent SPP</td>' +
        '<td class="mismatch-cell">40 (above the modelled unspent range, ' +
        'which may mean a gap in the recorded history, a free skill, or an ' +
        'unrecorded order or chosen-or-random choice; differs from the ' +
        'source figure, 20)</td></tr>',
    );
  });

  it('notes a stored figure not compared with the source, and a bare one', () => {
    const notCompared = service.render(
      input({
        stored: {
          kind: 'stored',
          stored: 5,
          placement: null,
          source: 'not_compared',
          sourceUnspent: 20,
        },
      }),
    );
    const bare = service.render(
      input({
        stored: {
          kind: 'stored',
          stored: 5,
          placement: null,
          source: 'no_figure',
          sourceUnspent: null,
        },
      }),
    );

    expect(notCompared).toContain(
      '<td>5 (not compared with the source figure under this rules set)</td>',
    );
    expect(bare).toContain('<td>Stored unspent SPP</td><td>5</td>');
  });

  it('says when no unspent SPP is stored', () => {
    const html = service.render(input({ stored: { kind: 'none_stored' } }));

    expect(html).toContain(
      '<td>Stored unspent SPP</td><td>— (not known exactly)</td>',
    );
  });

  it('shows a single value when the range is exact', () => {
    const html = service.render(
      input({
        model: {
          ...MODEL,
          range: { spentMin: 6, spentMax: 6, unspentMin: 34, unspentMax: 34 },
        },
      }),
    );

    expect(html).toContain('<td>Modelled spend</td><td>6</td>');
    expect(html).toContain('<td>Modelled unspent</td><td>34</td>');
  });

  it('explains in plain text why no range could be modelled', () => {
    const html = service.render(
      input({
        model: { ...MODEL, range: null, unknownReason: 'star_player' },
        compared: { kind: 'none' },
      }),
    );

    expect(html).toContain('<td>Modelled spend</td><td>—</td>');
    expect(html).toContain(
      '<p>Star players never advance, so no range is modelled.</p>',
    );
    expect(html).not.toContain('class="note"');
  });
});
