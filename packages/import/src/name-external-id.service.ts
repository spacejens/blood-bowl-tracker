import { Injectable } from '@nestjs/common';

/**
 * Centralizes every "Name" external-id string format used across the BBL and
 * TP importers, so the format cannot drift between them. Each entity kind gets
 * its own self-documenting method (rather than one generic `forBareName`) so
 * call sites read as "the Name id for this entity kind" and a future
 * entity-specific format change touches one method and its callers only.
 */
@Injectable()
export class NameExternalIdService {
  forCoach(name: string): string {
    return name;
  }

  /**
   * A competition group has no source-system id at all: its curated name is
   * the only stable identity it has, which is exactly what the Name system is
   * for (see packages/db/src/schema/competition-groups.ts).
   */
  forCompetitionGroup(name: string): string {
    return name;
  }

  forEra(name: string): string {
    return name;
  }

  forLeague(name: string): string {
    return name;
  }

  forRulesSet(name: string): string {
    return name;
  }

  forTeam(name: string): string {
    return name;
  }

  forRace(name: string): string {
    return name;
  }

  forStarPosition(name: string): string {
    return name;
  }

  /** Regular positions are race-scoped: names are not globally unique. */
  forPosition(raceName: string, positionName: string): string {
    return `${raceName}: ${positionName}`;
  }
}
