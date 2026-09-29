import { Injectable } from '@nestjs/common';

/**
 * Fits a list of error lines, rendered one per line, into a character
 * budget: the reply or message that shows them has a hard Discord length
 * cap, and error lists are uncapped. Keeps the leading whole lines that fit
 * and says how many were left out, so a reader knows the list is incomplete
 * and by how much, instead of the text simply stopping mid-line.
 *
 * At least one error is always shown: a first line too long for the budget
 * on its own is cut short with `…`, and the note is left off.
 *
 * Shared by `/importtp`'s reply and the TP feed's failure post. Pure and
 * dependency-free, so specs of its consumers may pass it real.
 */
@Injectable()
export class ErrorListFitService {
  fit(lines: string[], budget: number): string[] {
    if (lines.length === 0) {
      return lines;
    }
    // joinedLengths[k] is the length of the first k lines joined by '\n'.
    const joinedLengths = [0];
    lines.forEach((line, index) => {
      joinedLengths.push(
        joinedLengths[index] + line.length + (index > 0 ? 1 : 0),
      );
    });
    if (joinedLengths[lines.length] <= budget) {
      return lines;
    }
    for (let kept = lines.length - 1; kept >= 1; kept--) {
      const note = this.omittedNote(lines.length - kept);
      if (joinedLengths[kept] + 1 + note.length <= budget) {
        return [...lines.slice(0, kept), note];
      }
    }
    const [first] = lines;
    return [
      first.length <= budget
        ? first
        : `${first.slice(0, Math.max(budget - 1, 0))}…`,
    ];
  }

  private omittedNote(omitted: number): string {
    return omitted === 1
      ? '…and 1 more error not shown.'
      : `…and ${omitted} more errors not shown.`;
  }
}
