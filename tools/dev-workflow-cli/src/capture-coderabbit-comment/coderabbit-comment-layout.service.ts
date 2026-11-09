import { Injectable } from '@nestjs/common';

import {
  FENCED_CODE_BLOCK,
  INLINE_CODE_SPAN,
} from '../wait-for-pr-review/wait-for-pr-review.service';
import {
  NO_ACTIONABLE_COMMENTS_PHRASES,
  PROCESSING_BANNER_PHRASES,
} from '../wait-for-pr-review/wait-for-pr-review-filters.service';

const STATUS_START_MARKER = '<!-- recent_review_status_start -->';
const STATUS_END_MARKER = '<!-- recent_review_status_end -->';
const SECTION_START_MARKER = '<!-- recent_review_start -->';
const SECTION_END_MARKER = '<!-- recent_review_end -->';

const PROCESSING_BANNER_REGEX = new RegExp(PROCESSING_BANNER_PHRASES, 'i');
const VERDICT_REGEX = new RegExp(NO_ACTIONABLE_COMMENTS_PHRASES, 'i');

export type LayoutMarker =
  'statusBlock' | 'recentReviewSection' | 'processingBanner';

/** Where the in-progress rule's three landmarks sit in one comment body. */
export interface CoderabbitCommentLayout {
  readonly statusBlock: boolean;
  readonly recentReviewSection: boolean;
  /** Banner phrase found in prose, with code blocks and spans masked out. */
  readonly processingBanner: boolean;
  /** Banner phrase found anywhere, code included. */
  readonly processingBannerUnmasked: boolean;
  /** The landmarks present, ordered by where each starts in the body. */
  readonly order: readonly LayoutMarker[];
  readonly bannerInsideStatusBlock: boolean;
  readonly statusBlockVerdict: boolean;
  readonly sectionVerdict: boolean;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Describes the layout of one CodeRabbit comment body. Code is masked with
 * same-length blanks rather than removed, so every reported position still
 * refers to the original body.
 */
@Injectable()
export class CoderabbitCommentLayoutService {
  describe(body: string): CoderabbitCommentLayout {
    const prose = this.maskCode(body);
    const status = this.span(prose, STATUS_START_MARKER, STATUS_END_MARKER);
    const section = this.span(prose, SECTION_START_MARKER, SECTION_END_MARKER);
    const bannerIndex = prose.search(PROCESSING_BANNER_REGEX);
    const banner = bannerIndex === -1 ? undefined : bannerIndex;
    return {
      statusBlock: status !== undefined,
      recentReviewSection: section !== undefined,
      processingBanner: banner !== undefined,
      processingBannerUnmasked: PROCESSING_BANNER_REGEX.test(body),
      order: this.order([
        ['statusBlock', status?.start],
        ['recentReviewSection', section?.start],
        ['processingBanner', banner],
      ]),
      bannerInsideStatusBlock:
        banner !== undefined &&
        status !== undefined &&
        banner > status.start &&
        banner < status.end,
      statusBlockVerdict: this.hasVerdict(prose, status),
      sectionVerdict: this.hasVerdict(prose, section),
    };
  }

  private maskCode(body: string): string {
    const blank = (match: string): string => ' '.repeat(match.length);
    return body
      .replace(FENCED_CODE_BLOCK, blank)
      .replace(INLINE_CODE_SPAN, blank);
  }

  private span(
    text: string,
    startMarker: string,
    endMarker: string,
  ): Span | undefined {
    const start = text.indexOf(startMarker);
    if (start === -1) {
      return undefined;
    }
    const end = text.indexOf(endMarker, start + startMarker.length);
    return end === -1 ? undefined : { start, end: end + endMarker.length };
  }

  private order(
    starts: readonly (readonly [LayoutMarker, number | undefined])[],
  ): LayoutMarker[] {
    return starts
      .filter(
        (entry): entry is readonly [LayoutMarker, number] =>
          entry[1] !== undefined,
      )
      .sort((left, right) => left[1] - right[1])
      .map(([marker]) => marker);
  }

  private hasVerdict(prose: string, span: Span | undefined): boolean {
    return (
      span !== undefined &&
      VERDICT_REGEX.test(prose.slice(span.start, span.end))
    );
  }
}
