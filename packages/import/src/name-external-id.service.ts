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
    return this.bareName(name);
  }

  forEra(name: string): string {
    return this.bareName(name);
  }

  forLeague(name: string): string {
    return this.bareName(name);
  }

  forCompetition(name: string): string {
    return this.bareName(name);
  }

  forRulesSet(name: string): string {
    return this.bareName(name);
  }

  forTeam(name: string): string {
    return this.bareName(name);
  }

  forRace(name: string): string {
    return this.bareName(name);
  }

  forStarPosition(name: string): string {
    return this.bareName(name);
  }

  /** Regular positions are race-scoped: names are not globally unique. */
  forPosition(raceName: string, positionName: string): string {
    return `${raceName}: ${positionName}`;
  }

  private bareName(name: string): string {
    return name;
  }
}
