import { Injectable } from '@nestjs/common';
import {
  type Alias,
  type Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
  type YAMLMap,
} from 'yaml';

interface Context {
  readonly doc: Document;
  readonly lineCounter: LineCounter;
}

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
    const ctx: Context = { doc, lineCounter };
    const root = isMap(doc.contents) ? doc.contents : undefined;
    const jobs = this.deref(root?.get('jobs', true), ctx).node;
    if (!isMap(jobs)) {
      return [];
    }

    const entries: UsesEntry[] = [];
    for (const { value } of jobs.items) {
      const { node: job, line: jobLine } = this.deref(value, ctx);
      if (!isMap(job)) {
        continue;
      }
      this.collect(job, ctx, { line: jobLine, entries });
      const { node: steps, line: stepsLine } = this.deref(
        job.get('steps', true),
        ctx,
        jobLine,
      );
      if (!isSeq(steps)) {
        continue;
      }
      for (const item of steps.items) {
        const { node: step, line } = this.deref(item, ctx, stepsLine);
        if (isMap(step)) {
          this.collect(step, ctx, { line, entries });
        }
      }
    }
    return entries;
  }

  /**
   * Follows an alias to the node it stands for, so a value reached through
   * one is checked exactly like a literal. `line` is where the outermost
   * alias appears in the source (what a reader of the workflow sees), carried
   * down into everything the alias expands to; it stays `inherited` when
   * `node` is no alias. An alias resolves straight to a non-alias node, so
   * there is no chain to walk and the traversal cannot loop.
   */
  private deref(
    node: unknown,
    ctx: Context,
    inherited?: number,
  ): { node: unknown; line: number | undefined } {
    if (!isAlias(node)) {
      return { node, line: inherited };
    }
    return {
      node: node.resolve(ctx.doc),
      line: inherited ?? this.lineOf(node, ctx),
    };
  }

  private lineOf(node: Node | Alias, ctx: Context): number {
    // Every node of a parsed document carries a range; `get()` only erases
    // that from the type.
    const [offset] = node.range as [number, number, number];
    return ctx.lineCounter.linePos(offset).line;
  }

  private collect(
    map: YAMLMap,
    ctx: Context,
    target: { line: number | undefined; entries: UsesEntry[] },
  ): void {
    const { node, line } = this.deref(map.get('uses', true), ctx, target.line);
    if (!isScalar(node)) {
      return;
    }
    target.entries.push({
      // A non-string value (empty, `~`, a number, a boolean) is reported as
      // written so it fails the pin check instead of being coerced.
      uses: typeof node.value === 'string' ? node.value : (node.source ?? ''),
      line: line ?? this.lineOf(node, ctx),
    });
  }
}
