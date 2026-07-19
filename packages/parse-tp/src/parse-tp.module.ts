import { Module } from '@nestjs/common';

import { TournamentParserService } from './tournament-parser.service';

@Module({
  providers: [TournamentParserService],
  exports: [TournamentParserService],
})
export class ParseTpModule {}
