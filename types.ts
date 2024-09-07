export type InfoResponse = {
  protocol: number;
  name: string;
  map: string;
  folder: string;
  game: string;
  app_id: number;
  players: number;
  max_players: number;
  bots: number;
  server_type: string;
  environment: string;
  visibility: number;
  vac: number;
  version: string;
  port?: number;
  server_id?: bigint;
  spectator_port?: number;
  spectator_name?: string;
  keywords?: string;
  game_id?: bigint;
};

export type PlayerResponse = {
  player_count: number;
  players: Player[];
};

export type Player = {
  index: number;
  name: string;
  score: number;
  duration: number;
};

export type RulesResponse = {
  rule_count: number;
  rules: Rule[];
};

export type Rule = {
  name: string;
  value: string;
};
