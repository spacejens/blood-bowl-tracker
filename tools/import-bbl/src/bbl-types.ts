interface BblTeam {
  id: string;
  name: string;
  race: string;
  coachId: string;
}

interface BblPlayer {
  id: string;
  name: string;
  teamId: string;
  position: string;
}

interface BblMatchEvent {
  type: string;
  teamId: string;
  playerId?: string;
}

interface BblMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  playedAt: string;
  events: BblMatchEvent[];
}

interface BblCoach {
  id: string;
  name: string;
}

export interface BblExport {
  teams: BblTeam[];
  players: BblPlayer[];
  matches: BblMatch[];
  coaches: BblCoach[];
}
