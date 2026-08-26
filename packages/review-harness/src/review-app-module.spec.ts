import { DATABASE_URL, DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import type { DynamicModule } from '@nestjs/common';
import { Global, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { createReviewAppModule } from './review-app-module';

@Injectable()
class FakeConfigService {
  getDatabaseUrl(): string {
    return 'postgres://u:p@localhost:5433/db';
  }
}

@Global()
@Module({ providers: [FakeConfigService], exports: [FakeConfigService] })
class FakeConfigModule {}

@Injectable()
class FakeReviewService {
  readonly id = 'review';
}

@Module({ providers: [FakeReviewService], exports: [FakeReviewService] })
class FakeHarnessModule {}

@Module({})
class FakeAppModule {
  static register(): DynamicModule {
    return createReviewAppModule({
      module: FakeAppModule,
      configModule: FakeConfigModule,
      configService: FakeConfigService,
      harnessModule: FakeHarnessModule,
    });
  }
}

describe('createReviewAppModule', () => {
  it('wires the harness module so its exported service resolves', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeAppModule.register()],
    })
      // The real DB provider would connect to Postgres and run migrations;
      // this test is about the graph, not the database.
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(FakeReviewService)).toBeInstanceOf(FakeReviewService);
  });

  it('feeds the config service database url into DbModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeAppModule.register()],
    })
      .overrideProvider(DB)
      .useValue(mockDb().db)
      .compile();

    expect(moduleRef.get(DATABASE_URL)).toBe(
      'postgres://u:p@localhost:5433/db',
    );
  });
});
