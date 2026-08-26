import type { DataTypeReviewer } from './data-type-reviewer';
import type { HtmlService } from './html.service';
import type {
  ReportBuilderBase,
  ReviewedItem,
  ReviewPanel,
} from './report-builder-base.service';
import type { ReportWriterService } from './report-writer.service';
import type { ReviewGap, Sampled } from './review.types';

/** What one review run produced. */
export interface ReviewOutcome {
  /** Absolute path of the written report. */
  reportPath: string;
  /** How many entities the report covers. */
  itemCount: number;
  /** Strata/overrides that produced nothing — printed as warnings by main. */
  gaps: ReviewGap[];
}

/**
 * The one thing the orchestration needs from a tool's sampler: which entities
 * the report covers, and what it could not cover.
 */
export interface ReviewSampler<TSampled> {
  sample(): Promise<{ items: TSampled[]; gaps: ReviewGap[] }>;
}

/**
 * The whole run: sample entities, ask every registered reviewer for its two
 * panels per entity, assemble the document, write it.
 *
 * A reviewer that throws for one entity yields an inline note in that panel
 * and the run continues — a single unreadable source file must not cost the
 * developer the rest of the report.
 *
 * A tool subclasses this and supplies only `prepare()`: whatever extra data
 * the report needs alongside each sampled entity.
 */
export abstract class ReviewServiceBase<
  TSampled extends Sampled<unknown>,
  TReviewed,
> {
  constructor(
    private readonly sampler: ReviewSampler<TSampled>,
    private readonly reviewers: DataTypeReviewer<TSampled>[],
    private readonly builder: ReportBuilderBase<TReviewed>,
    private readonly writer: ReportWriterService,
    private readonly html: HtmlService,
  ) {}

  /**
   * Runs once per report, before any panel is rendered, and returns the
   * mapping from a sampled entity to the entity the report renders. The
   * batch shape is deliberate: a subclass that needs extra data for every
   * entity looks it all up in one query here rather than once per entity.
   */
  protected abstract prepare(
    items: TSampled[],
  ): Promise<(item: TSampled) => TReviewed>;

  async run(): Promise<ReviewOutcome> {
    const { items, gaps } = await this.sampler.sample();
    const toReviewed = await this.prepare(items);

    const reviewed: ReviewedItem<TReviewed>[] = [];
    for (const item of items) {
      const panels: ReviewPanel[] = [];
      for (const reviewer of this.reviewers) {
        panels.push(await this.panel(reviewer, item));
      }
      reviewed.push({ item: toReviewed(item), panels });
    }

    const generatedAt = new Date();
    const html = this.builder.build({ items: reviewed, gaps, generatedAt });
    const reportPath = await this.writer.write(html, generatedAt);
    return { reportPath, itemCount: reviewed.length, gaps };
  }

  private async panel(
    reviewer: DataTypeReviewer<TSampled>,
    item: TSampled,
  ): Promise<ReviewPanel> {
    return {
      dataTypeId: reviewer.id,
      rawHtml: await this.fragment(() => reviewer.getRawSource(item)),
      importedHtml: await this.fragment(() => reviewer.getImportedView(item)),
      rawLabel:
        typeof reviewer.rawPanelLabel === 'string'
          ? reviewer.rawPanelLabel
          : undefined,
      importedLabel:
        typeof reviewer.importedPanelLabel === 'string'
          ? reviewer.importedPanelLabel
          : undefined,
    };
  }

  private async fragment(render: () => Promise<string>): Promise<string> {
    try {
      return await render();
    } catch (error) {
      return this.html.note(
        `Rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
