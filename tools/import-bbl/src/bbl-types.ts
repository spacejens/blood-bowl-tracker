export interface BblTeam {
  id: string;
  name: string;
  race: string;
  coachId: string;
}

export interface BblPlayer {
  id: string;
  name: string;
  teamId: string;
  position: string;
}

export interface BblMatchEvent {
  type: string;
  teamId: string;
  playerId?: string;
}

export interface BblMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  playedAt: string;
  events: BblMatchEvent[];
}

export interface BblCoach {
  id: string;
  name: string;
}

export interface BblExport {
  teams: BblTeam[];
  players: BblPlayer[];
  matches: BblMatch[];
  coaches: BblCoach[];
}
