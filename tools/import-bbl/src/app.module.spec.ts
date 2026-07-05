import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { BblCoachesImportService } from './bbl/bbl-coaches-import.service';

describe('AppModule', () => {
  it('registers BblCoachesImportService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register('http://localhost:3000')],
    }).compile();

    expect(moduleRef.get(BblCoachesImportService)).toBeInstanceOf(
      BblCoachesImportService,
    );
  });
});
