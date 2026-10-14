import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { WorkflowUsesExtractorService } from './extract/workflow-uses-extractor.service';
import {
  DEFAULT_WORKFLOWS_DIR,
  WorkflowLintService,
  WORKFLOWS_DIR,
} from './lint/workflow-lint.service';
import { UsesRefClassifierService } from './uses-ref/uses-ref-classifier.service';

describe('AppModule', () => {
  it('wires the workflow check with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(WorkflowLintService)).toBeInstanceOf(
      WorkflowLintService,
    );
    expect(moduleRef.get(WorkflowUsesExtractorService)).toBeInstanceOf(
      WorkflowUsesExtractorService,
    );
    expect(moduleRef.get(UsesRefClassifierService)).toBeInstanceOf(
      UsesRefClassifierService,
    );
    expect(moduleRef.get(WORKFLOWS_DIR)).toBe(DEFAULT_WORKFLOWS_DIR);
  });
});
