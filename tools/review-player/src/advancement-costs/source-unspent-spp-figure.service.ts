import { Injectable } from '@nestjs/common';

import type { ReviewPlayer } from '../shared/review.types';
import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';

/**
 * The unspent figure one source reports for a player, with the total it
 * reports beside it; the source's own spend is the total minus the unspent.
 */
export interface SourceUnspentSppFigure {
  source: 'bbl' | 'tp';
  unspentLabel: string;
  unspent: number | null;
  totalLabel: string;
  reportedTotal: number | null;
  /** Label for the spend derived from the two figures above. */
  spendLabel: string;
}

/**
 * The SPP figures a source itself reports, for comparison with the modelled
 * spend: BBL's "Unspent SPP" row and its bracketed career total, or TP's
 * roster `starPlayerPoints` and `totalStarPlayerPoints` from the same roster
 * snapshot. What TP's fields mean is documented in
 * `docs/import-tp/file-format-rosters.md`. One place for both the imported
 * panel and the stratum, so they can never compare against different figures.
 */
@Injectable()
export class SourceUnspentSppFigureService {
  constructor(
    private readonly bbl: BblUnspentSppReaderService,
    private readonly tp: TpRawPlayerSkillsIndexService,
  ) {}

  async figureFor(
    player: Pick<ReviewPlayer, 'source' | 'externalId'>,
  ): Promise<SourceUnspentSppFigure | null> {
    if (player.source === 'bbl') {
      const figures = await this.bbl.read(player.externalId);
      return figures === null
        ? null
        : {
            source: 'bbl',
            unspentLabel: 'BBL Unspent SPP',
            unspent: figures.unspent,
            totalLabel: 'BBL career SPP (bracketed)',
            reportedTotal: figures.careerTotal,
            spendLabel: 'BBL spent SPP (career minus unspent)',
          };
    }
    if (player.source === 'tp') {
      const figures = await this.tp.sppFiguresFor(player.externalId);
      return figures === null
        ? null
        : {
            source: 'tp',
            unspentLabel: 'TP starPlayerPoints',
            unspent: figures.starPlayerPoints,
            totalLabel: 'TP totalStarPlayerPoints',
            reportedTotal: figures.totalStarPlayerPoints,
            spendLabel: 'TP spent SPP (total minus starPlayerPoints)',
          };
    }
    return null;
  }
}
