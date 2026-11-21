import { Module } from '@nestjs/common';

import { PerMatchAverageSqlService } from './per-match-average-sql.service';

@Module({
  providers: [PerMatchAverageSqlService],
  exports: [PerMatchAverageSqlService],
})
export class PerMatchAverageSqlModule {}
