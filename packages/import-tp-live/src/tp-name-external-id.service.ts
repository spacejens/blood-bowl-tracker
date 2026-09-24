import { Injectable } from '@nestjs/common';

/**
 * The Name-system external ids this package writes. They must be exactly what
 * packages/import's NameExternalIdService produces for the same entity kinds:
 * a team or star position imported live and one imported by a bulk tool have
 * to land on the same row. A separate copy because this package runs
 * server-side and cannot depend on packages/import; keep the two in step.
 * Constructor-free identity formatting, so specs may pass it as a real
 * provider.
 */
@Injectable()
export class TpNameExternalIdService {
  forTeam(name: string): string {
    return name;
  }

  forStarPosition(name: string): string {
    return name;
  }

  forRace(name: string): string {
    return name;
  }

  /** Position names are not globally unique, so a regular position's is race-scoped. */
  forPosition(raceName: string, positionName: string): string {
    return `${raceName}: ${positionName}`;
  }

  forSkill(name: string): string {
    return name;
  }
}
