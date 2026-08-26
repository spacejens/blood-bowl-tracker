import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { HtmlService } from './html.service';
import type {
  ReportEntityNoun,
  ReviewPanel,
  ReviewReport,
} from './report-builder-base.service';
import { ReportBuilderBase } from './report-builder-base.service';
import type { ReviewSource } from './review.types';

/** The smallest thing a report can be about: something with a source. */
interface TestItem {
  source: ReviewSource;
  name: string;
}

/**
 * A minimal concrete subclass: it supplies only the three hooks, so every
 * assertion below is about `ReportBuilderBase`'s own document shell.
 */
@Injectable()
class TestReportBuilderService extends ReportBuilderBase<TestItem> {
  protected readonly title = 'Test import review';
  protected readonly entityNoun: ReportEntityNoun = {
    singular: 'thing',
    plural: 'things',
  };

  constructor(html: HtmlService) {
    super(html);
  }

  protected renderSection(item: TestItem, panels: ReviewPanel[]): string {
    return `<section class="thing"><h2>${this.html.escape(item.name)}</h2>${panels
      .map((panel) => this.panelPair(panel, item.source))
      .join('\n')}</section>`;
  }
}

const generatedAt = new Date('2026-08-26T09:00:00.000Z');

const panel: ReviewPanel = {
  dataTypeId: 'test-data',
  rawHtml: '<p>raw panel</p>',
  importedHtml: '<p>imported panel</p>',
};

const item: TestItem = { source: 'bbl', name: 'First thing' };

function reportWith(panels: ReviewPanel[]): ReviewReport<TestItem> {
  return { items: [{ item, panels }], gaps: [], generatedAt };
}

describe('ReportBuilderBase', () => {
  let service: TestReportBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TestReportBuilderService, HtmlService],
    }).compile();
    service = moduleRef.get(TestReportBuilderService);
  });

  it('builds a standalone document titled by the subclass', () => {
    const html = service.build(reportWith([panel]));

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Test import review</title>');
    expect(html).toContain('<h1>Test import review</h1>');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('carries the shared stylesheet', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain('.panels { display: grid;');
    expect(html).toContain('.result {');
    expect(html).toContain('tr.mismatch td {');
  });

  it('states when the report was generated and how many entities it covers', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain('2026-08-26T09:00:00.000Z');
    expect(html).toContain('1 thing.');
  });

  it('pluralises the entity noun for anything but one entity', () => {
    const html = service.build({
      items: [
        { item, panels: [] },
        { item: { source: 'tp', name: 'Second thing' }, panels: [] },
      ],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('2 things.');
  });

  it('renders one subclass section per reviewed entity', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain('<section class="thing">');
    expect(html).toContain('First thing');
  });

  it('says so explicitly when nothing was sampled', () => {
    const html = service.build({ items: [], gaps: [], generatedAt });

    expect(html).toContain('<p class="note">No things were sampled.</p>');
  });

  it('says so explicitly when there are no gaps', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain(
      'No gaps: every stratum and override produced at least one thing.',
    );
  });

  it('tabulates the gaps when there are any', () => {
    const html = service.build({
      items: [],
      gaps: [{ source: 'tp', reason: 'No thing found for stratum "X"' }],
      generatedAt,
    });

    expect(html).toContain('<h2>Gaps</h2>');
    expect(html).toContain('TP');
    expect(html).toContain('No thing found for stratum &quot;X&quot;');
  });

  it('heads a panel pair with the data type and default panel labels', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain('<h3>test-data</h3>');
    expect(html).toContain('<h4>Raw source (BBL)</h4>');
    expect(html).toContain('<h4>Imported (database)</h4>');
  });

  it("prefers a panel's own labels when the reviewer supplied them", () => {
    const html = service.build(
      reportWith([
        {
          ...panel,
          rawLabel: 'Computed from match events (database)',
          importedLabel: 'Stored player totals (database)',
        },
      ]),
    );

    expect(html).toContain('<h4>Computed from match events (database)</h4>');
    expect(html).toContain('<h4>Stored player totals (database)</h4>');
  });

  it('inserts both panel fragments verbatim, raw first', () => {
    const html = service.build(reportWith([panel]));

    expect(html).toContain('<p>raw panel</p>');
    expect(html).toContain('<p>imported panel</p>');
    expect(html.indexOf('<p>raw panel</p>')).toBeLessThan(
      html.indexOf('<p>imported panel</p>'),
    );
    expect(html).toContain('class="panels"');
  });
});
