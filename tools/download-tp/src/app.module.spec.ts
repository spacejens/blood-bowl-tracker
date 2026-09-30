import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { BrowserLeaguesDownloaderService } from './downloader/browser-leagues-downloader.service';
import { HttpLeaguesDownloaderService } from './downloader/http-leagues-downloader.service';
import { HttpOfficialTeamsDownloaderService } from './downloader/http-official-teams-downloader.service';

describe('AppModule', () => {
  it('registers HttpLeaguesDownloaderService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(HttpLeaguesDownloaderService)).toBeInstanceOf(
      HttpLeaguesDownloaderService,
    );
  });

  it('registers HttpOfficialTeamsDownloaderService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(HttpOfficialTeamsDownloaderService)).toBeInstanceOf(
      HttpOfficialTeamsDownloaderService,
    );
  });

  it('registers BrowserLeaguesDownloaderService with its dependencies wired', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(BrowserLeaguesDownloaderService)).toBeInstanceOf(
      BrowserLeaguesDownloaderService,
    );
  });
});
