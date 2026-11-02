import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

/**
 * Contains a rendering failure to the one section that raised it. The harness
 * replaces a whole panel with a failure note when a reviewer method rejects;
 * a reviewer that stacks several sections runs each through here so only the
 * failing section shows the note and the others still render.
 */
@Injectable()
export class SectionRenderService {
  constructor(private readonly html: HtmlService) {}

  /** The section's output, or a failure note when it rejects. */
  async render(section: () => Promise<string>): Promise<string> {
    try {
      return await section();
    } catch (error) {
      return this.failureNote(error);
    }
  }

  /**
   * A section that yields two strings placed apart in the panel. A rejection
   * puts the failure note in both places.
   */
  async renderPair(
    section: () => Promise<readonly [string, string]>,
  ): Promise<readonly [string, string]> {
    try {
      return await section();
    } catch (error) {
      const note = this.failureNote(error);
      return [note, note];
    }
  }

  private failureNote(error: unknown): string {
    return this.html.note(
      `Rendering failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
