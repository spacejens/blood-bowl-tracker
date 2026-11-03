import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

/**
 * Contains a rendering failure to the one part that raised it. The harness
 * replaces a whole panel with a failure note when a reviewer method rejects;
 * a reviewer that stacks several parts runs each through here so only the
 * failing part shows the note and the others still render.
 *
 * Duplicated from review-player rather than moved into the shared harness,
 * like the other review-tool helpers each tool keeps for itself.
 */
@Injectable()
export class SectionRenderService {
  constructor(private readonly html: HtmlService) {}

  /** The part's output, or a failure note when it rejects. */
  async render(section: () => Promise<string>): Promise<string> {
    try {
      return await section();
    } catch (error) {
      return this.html.note(
        `Rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
