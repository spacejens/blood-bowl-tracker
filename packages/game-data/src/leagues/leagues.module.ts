import { Module } from '@nestjs/common';
import { LeaguesService } from './leagues.service';

@Module({
  providers: [LeaguesService],
  exports: [LeaguesService],
})
export class LeaguesModule {}
