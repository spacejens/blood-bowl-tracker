import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoderabbitCommentLayoutService } from './coderabbit-comment-layout.service';

const STATUS_START = '<!-- recent_review_status_start -->';
const STATUS_END = '<!-- recent_review_status_end -->';
const SECTION_START = '<!-- recent_review_start -->';
const SECTION_END = '<!-- recent_review_end -->';
const BANNER =
  'Currently processing new changes in this PR. This may take a few minutes, please wait...';
const VERDICT = 'No actionable comments were generated in the recent review.';

/**
 * A real in-progress rolling comment body as CodeRabbit wrote it while a pass
 * was running, abridged: every generated HTML-comment marker and the `[!NOTE]`
 * banner block are verbatim, everything else is shortened to a line. It holds
 * neither a `recent_review_status` block nor a `recent_review` section.
 */
const REAL_IN_PROGRESS_BODY = [
  '<!-- coderabbit-ai-generated:v1 -->',
  '',
  '<!-- This is an auto-generated comment: summarize by coderabbit.ai -->',
  '<!-- review_stack_entry_start -->',
  '',
  'Change stack button',
  '',
  '<!-- review_stack_entry_end -->',
  '<!-- This is an auto-generated comment: review in progress by coderabbit.ai -->',
  '',
  '> [!NOTE]',
  '> <picture><source media="(prefers-color-scheme: dark)" srcset="https://storage.googleapis.com/coderabbit_public_assets/review-in-progress-v2/loading-dark.gif"><source media="(prefers-color-scheme: light)" srcset="https://storage.googleapis.com/coderabbit_public_assets/review-in-progress-v2/loading-light.gif"><img width="491" alt="CodeRabbit ASCII loading animation" src="https://storage.googleapis.com/coderabbit_public_assets/review-in-progress-v2/loading-light.gif"></picture>',
  '> ',
  '> Currently processing new changes in this PR. This may take a few minutes, please wait...',
  '',
  '<details>',
  '<summary><strong>Review info</strong></summary>',
  'Run configuration, commit range and the selected files.',
  '</details>',
  '',
  '<!-- end of auto-generated comment: review in progress by coderabbit.ai -->',
  '',
].join('\n');

function status(text: string): string {
  return `${STATUS_START}\n\n${text}\n\n${STATUS_END}\n`;
}

function section(text: string): string {
  return `${SECTION_START}\n\n${text}\n\n${SECTION_END}\n`;
}

describe('CoderabbitCommentLayoutService', () => {
  let service: CoderabbitCommentLayoutService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CoderabbitCommentLayoutService],
    }).compile();
    service = moduleRef.get(CoderabbitCommentLayoutService);
  });

  it('reports nothing for an empty body', () => {
    expect(service.describe('')).toEqual({
      statusBlock: false,
      recentReviewSection: false,
      processingBanner: false,
      processingBannerUnmasked: false,
      order: [],
      bannerInsideStatusBlock: false,
      statusBlockVerdict: false,
      sectionVerdict: false,
    });
  });

  it('reports a banner that replaced the verdict inside the status block, next to a stale section', () => {
    const layout = service.describe(
      status(BANNER) + 'walkthrough\n' + section('Reviewing files abc..def'),
    );

    expect(layout).toEqual({
      statusBlock: true,
      recentReviewSection: true,
      processingBanner: true,
      processingBannerUnmasked: true,
      order: ['statusBlock', 'processingBanner', 'recentReviewSection'],
      bannerInsideStatusBlock: true,
      statusBlockVerdict: false,
      sectionVerdict: false,
    });
  });

  it('reports a banner outside a status block that still carries the old verdict', () => {
    const layout = service.describe(
      `${BANNER}\n\n` + status(VERDICT) + section('range'),
    );

    expect(layout.order).toEqual([
      'processingBanner',
      'statusBlock',
      'recentReviewSection',
    ]);
    expect(layout.bannerInsideStatusBlock).toBe(false);
    expect(layout.statusBlockVerdict).toBe(true);
    expect(layout.sectionVerdict).toBe(false);
  });

  it('describes a real in-progress body as banner only', () => {
    const layout = service.describe(REAL_IN_PROGRESS_BODY);

    expect(layout.processingBanner).toBe(true);
    expect(layout.processingBannerUnmasked).toBe(true);
    expect(layout.statusBlock).toBe(false);
    expect(layout.recentReviewSection).toBe(false);
    expect(layout.order).toEqual(['processingBanner']);
  });

  it('finds a verdict held only in the recent_review section', () => {
    const layout = service.describe(section(VERDICT));

    expect(layout.sectionVerdict).toBe(true);
    expect(layout.statusBlockVerdict).toBe(false);
  });

  it('matches the banner case-insensitively', () => {
    expect(
      service.describe('CURRENTLY PROCESSING NEW CHANGES in this PR')
        .processingBanner,
    ).toBe(true);
  });

  it('ignores a banner phrase quoted only inside an inline code span, but reports it unmasked', () => {
    const layout = service.describe(
      'Summary mentions `currently processing new changes` as a phrase.',
    );

    expect(layout.processingBanner).toBe(false);
    expect(layout.processingBannerUnmasked).toBe(true);
  });

  it('ignores markers and phrases inside a fenced code block', () => {
    const layout = service.describe(
      '```\n' + status(BANNER) + section(VERDICT) + '```\n',
    );

    expect(layout.statusBlock).toBe(false);
    expect(layout.recentReviewSection).toBe(false);
    expect(layout.processingBanner).toBe(false);
    expect(layout.processingBannerUnmasked).toBe(true);
    expect(layout.order).toEqual([]);
    expect(layout.bannerInsideStatusBlock).toBe(false);
  });

  it('treats an unpaired start marker as no block', () => {
    const layout = service.describe(`${STATUS_START}\n${BANNER}\n`);

    expect(layout.statusBlock).toBe(false);
    expect(layout.bannerInsideStatusBlock).toBe(false);
    expect(layout.order).toEqual(['processingBanner']);
  });

  it('treats a lone end marker as no block', () => {
    const layout = service.describe(`${BANNER}\n${STATUS_END}\n`);

    expect(layout.statusBlock).toBe(false);
    expect(layout.bannerInsideStatusBlock).toBe(false);
    expect(layout.order).toEqual(['processingBanner']);
  });

  it('treats an end marker before the start marker as no block', () => {
    const layout = service.describe(
      `${STATUS_END}\n${STATUS_START}\n${BANNER}\n`,
    );

    expect(layout.statusBlock).toBe(false);
    expect(layout.bannerInsideStatusBlock).toBe(false);
    expect(layout.order).toEqual(['processingBanner']);
  });
});
