import { Injectable } from '@nestjs/common';

/**
 * Every "Name" external-id string format, shared by the bulk importers
 * (through packages/import) and the server-side live TP import
 * (packages/import-tp-live). The strings must be identical on both sides: a
 * coach, team or position imported live and one imported by a bulk tool have
 * to land on the same row. Each entity kind gets its own self-documenting
 * method (rather than one generic `forBareName`) so call sites read as "the
 * Name id for this entity kind" and a future entity-specific format change
 * touches one method and its callers only. Constructor-free identity
 * formatting, so specs may pass it as a real provider.
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

  /**
   * Skill names are globally unique (unlike positions, which are race-scoped),
   * so the bare name is the identity BBL, TP and the curated files all
   * converge on.
   */
  forSkill(name: string): string {
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
