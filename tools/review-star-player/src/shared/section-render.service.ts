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

  /**
   * The section's output, or a failure note naming the section by `label`
   * when it rejects, so a reader can tell which section failed even where no
   * sub-heading precedes it.
   */
  async render(label: string, section: () => Promise<string>): Promise<string> {
    try {
      return await section();
    } catch (error) {
      return this.html.note(
        `Rendering failed (${label}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
