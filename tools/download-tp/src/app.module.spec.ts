import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { LeaguesDownloaderService } from './downloader/leagues-downloader.service';
import { OfficialTeamsDownloaderService } from './downloader/official-teams-downloader.service';

describe('AppModule', () => {
  it('registers LeaguesDownloaderService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(LeaguesDownloaderService)).toBeInstanceOf(
      LeaguesDownloaderService,
    );
  });

  it('registers OfficialTeamsDownloaderService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(OfficialTeamsDownloaderService)).toBeInstanceOf(
      OfficialTeamsDownloaderService,
    );
  });
});
