import { Module } from '@nestjs/common';

import { WorkflowUsesExtractorService } from './extract/workflow-uses-extractor.service';
import {
  DEFAULT_WORKFLOWS_DIR,
  WorkflowLintService,
  WORKFLOWS_DIR,
} from './lint/workflow-lint.service';
import { UsesRefClassifierService } from './uses-ref/uses-ref-classifier.service';

@Module({
  providers: [
    { provide: WORKFLOWS_DIR, useValue: DEFAULT_WORKFLOWS_DIR },
    UsesRefClassifierService,
    WorkflowUsesExtractorService,
    WorkflowLintService,
  ],
})
export class AppModule {}
