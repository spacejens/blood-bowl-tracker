import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { DataTypeReviewer } from './data-type-reviewer';
import { DATA_TYPE_REVIEWERS } from './data-type-reviewer';
import { HtmlService } from './html.service';
import { ReportBuilderBase } from './report-builder-base.service';
import { ReportWriterService } from './report-writer.service';
import type { Sampled } from './review.types';
import type { ReviewOutcome, ReviewSampler } from './review-base.service';
import { ReviewServiceBase } from './review-base.service';

type TestItem = Sampled<{ name: string }>;
type TestReviewed = TestItem & { prepared: true };

const SAMPLER = Symbol('TEST_SAMPLER');

/**
 * A minimal concrete subclass: `prepare` only marks each entity, so every
 * assertion below is about `ReviewServiceBase`'s own orchestration.
 */
@Injectable()
class TestReviewService extends ReviewServiceBase<TestItem, TestReviewed> {
  /** Every `prepare()` argument, so a test can assert it was batched once. */
  readonly prepareCalls: TestItem[][] = [];

  constructor(
    @Inject(SAMPLER) sampler: ReviewSampler<TestItem>,
    @Inject(DATA_TYPE_REVIEWERS) reviewers: DataTypeReviewer<TestItem>[],
    builder: ReportBuilderBase<TestReviewed>,
    writer: ReportWriterService,
    html: HtmlService,
  ) {
    super(sampler, reviewers, builder, writer, html);
  }

  protected prepare(
    items: TestItem[],
  ): Promise<(item: TestItem) => TestReviewed> {
    this.prepareCalls.push(items);
    return Promise.resolve((item) => ({ ...item, prepared: true }));
  }
}

const item: TestItem = { name: 'First thing', selectedFor: ['Random sample'] };

interface Harness {
  service: TestReviewService;
  builder: MockProxy<ReportBuilderBase<TestReviewed>>;
  writer: MockProxy<ReportWriterService>;
  sampler: MockProxy<ReviewSampler<TestItem>>;
}

async function makeService(
  reviewers: DataTypeReviewer<TestItem>[],
  items: TestItem[] = [item],
): Promise<Harness> {
  const sampler = mock<ReviewSampler<TestItem>>();
  sampler.sample.mockResolvedValue({ items, gaps: [] });
  const builder = mock<ReportBuilderBase<TestReviewed>>();
  builder.build.mockReturnValue('<html></html>');
  const writer = mock<ReportWriterService>();
  writer.write.mockResolvedValue('/tmp/report-2026-08-26T09-00-00Z.html');
  const moduleRef = await Test.createTestingModule({
    providers: [
      TestReviewService,
      { provide: SAMPLER, useValue: sampler },
      { provide: DATA_TYPE_REVIEWERS, useValue: reviewers },
      { provide: ReportBuilderBase, useValue: builder },
      { provide: ReportWriterService, useValue: writer },
      HtmlService,
    ],
  }).compile();
  return {
    service: moduleRef.get(TestReviewService),
    builder,
    writer,
    sampler,
  };
}

function makeReviewer(): MockProxy<DataTypeReviewer<TestItem>> {
  const reviewer = mock<DataTypeReviewer<TestItem>>();
  Object.assign(reviewer, { id: 'test-data' });
  reviewer.getRawSource.mockResolvedValue('<p>raw</p>');
  reviewer.getImportedView.mockResolvedValue('<p>imported</p>');
  return reviewer;
}

describe('ReviewServiceBase', () => {
  it('asks every reviewer for both panels of every sampled entity', async () => {
    const reviewer = makeReviewer();
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    expect(reviewer.getRawSource).toHaveBeenCalledWith(item);
    expect(reviewer.getImportedView).toHaveBeenCalledWith(item);
    expect(builder.build.mock.calls[0][0].items[0].panels).toEqual([
      {
        dataTypeId: 'test-data',
        rawHtml: '<p>raw</p>',
        importedHtml: '<p>imported</p>',
        rawLabel: undefined,
        importedLabel: undefined,
      },
    ]);
  });

  it("copies a reviewer's panel labels onto the panel", async () => {
    const reviewer = makeReviewer();
    Object.assign(reviewer, {
      rawPanelLabel: 'Computed from match events (database)',
      importedPanelLabel: 'Stored player totals (database)',
    });
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    expect(builder.build.mock.calls[0][0].items[0].panels[0]).toMatchObject({
      rawLabel: 'Computed from match events (database)',
      importedLabel: 'Stored player totals (database)',
    });
  });

  it('prepares every sampled entity in one batch before rendering', async () => {
    const second: TestItem = {
      name: 'Second thing',
      selectedFor: ['override'],
    };
    const { service, builder } = await makeService(
      [makeReviewer()],
      [item, second],
    );

    await service.run();

    expect(service.prepareCalls).toEqual([[item, second]]);
    expect(builder.build.mock.calls[0][0].items.map((e) => e.item)).toEqual([
      { ...item, prepared: true },
      { ...second, prepared: true },
    ]);
  });

  it('writes the built document and reports where it landed', async () => {
    const { service, writer } = await makeService([makeReviewer()]);

    const outcome: ReviewOutcome = await service.run();

    expect(outcome).toEqual({
      reportPath: '/tmp/report-2026-08-26T09-00-00Z.html',
      itemCount: 1,
      gaps: [],
    });
    expect(writer.write).toHaveBeenCalledWith(
      '<html></html>',
      expect.any(Date),
    );
  });

  it('writes the document with the same generatedAt the report body shows', async () => {
    const { service, builder, writer } = await makeService([makeReviewer()]);

    await service.run();

    expect(writer.write).toHaveBeenCalledWith(
      '<html></html>',
      builder.build.mock.calls[0][0].generatedAt,
    );
  });

  it("passes the sampler's gaps through to the report and the outcome", async () => {
    const gaps = [{ source: 'tp' as const, reason: 'nothing found' }];
    const { service, builder, sampler } = await makeService([makeReviewer()]);
    sampler.sample.mockResolvedValue({ items: [], gaps });

    const outcome = await service.run();

    expect(outcome.gaps).toEqual(gaps);
    expect(builder.build.mock.calls[0][0].gaps).toEqual(gaps);
  });

  it('turns a failing panel into an inline note instead of aborting the run', async () => {
    const reviewer = makeReviewer();
    reviewer.getRawSource.mockRejectedValue(new Error('disk on fire'));
    const { service, builder } = await makeService([reviewer]);

    const outcome = await service.run();

    const panel = builder.build.mock.calls[0][0].items[0].panels[0];
    expect(panel.rawHtml).toBe(
      '<p class="note">Rendering failed: disk on fire</p>',
    );
    expect(panel.importedHtml).toBe('<p>imported</p>');
    expect(outcome.itemCount).toBe(1);
  });

  it('stringifies a non-Error rejection in the inline note', async () => {
    const reviewer = makeReviewer();
    reviewer.getImportedView.mockRejectedValue('disk on fire');
    const { service, builder } = await makeService([reviewer]);

    await service.run();

    expect(builder.build.mock.calls[0][0].items[0].panels[0].importedHtml).toBe(
      '<p class="note">Rendering failed: disk on fire</p>',
    );
  });
});
