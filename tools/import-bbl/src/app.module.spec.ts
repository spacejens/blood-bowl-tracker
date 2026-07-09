import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { BblCoachesImportService } from './coaches/bbl-coaches-import.service';

describe('AppModule', () => {
  it('registers BblCoachesImportService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register()],
    }).compile();

    expect(moduleRef.get(BblCoachesImportService)).toBeInstanceOf(
      BblCoachesImportService,
    );
  });
});
