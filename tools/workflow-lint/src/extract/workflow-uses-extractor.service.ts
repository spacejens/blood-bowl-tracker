import { Injectable } from '@nestjs/common';
import {
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type YAMLMap,
} from 'yaml';

/** One `uses:` value found in a workflow, with the 1-based line it sits on. */
export interface UsesEntry {
  readonly uses: string;
  readonly line: number;
}

/**
 * Parses a GitHub Actions workflow and returns every `uses:` value GitHub
 * would resolve: job-level (`jobs.<job>.uses`, a reusable workflow) and
 * step-level (`jobs.<job>.steps[].uses`). Anything shaped differently is
 * skipped — GitHub rejects such a workflow itself — so only YAML that does
 * not parse at all is an error.
 */
@Injectable()
export class WorkflowUsesExtractorService {
  extract(source: string): UsesEntry[] {
    const lineCounter = new LineCounter();
    const doc = parseDocument(source, { lineCounter });
    if (doc.errors.length > 0) {
      throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
    }
    const jobs = isMap(doc.contents)
      ? doc.contents.get('jobs', true)
      : undefined;
    if (!isMap(jobs)) {
      return [];
    }

    const entries: UsesEntry[] = [];
    for (const { value: job } of jobs.items) {
      if (!isMap(job)) {
        continue;
      }
      this.collect(job, lineCounter, entries);
      const steps = job.get('steps', true);
      if (!isSeq(steps)) {
        continue;
      }
      for (const step of steps.items) {
        if (isMap(step)) {
          this.collect(step, lineCounter, entries);
        }
      }
    }
    return entries;
  }

  private collect(
    map: YAMLMap,
    lineCounter: LineCounter,
    entries: UsesEntry[],
  ): void {
    const node = map.get('uses', true);
    if (!isScalar(node)) {
      return;
    }
    // Every node of a parsed document carries a range; `get()` only erases
    // that from the type.
    const [offset] = node.range as [number, number, number];
    entries.push({
      uses: String(node.value),
      line: lineCounter.linePos(offset).line,
    });
  }
}
