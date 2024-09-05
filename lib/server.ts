import { PromiseSocket } from './socket.ts';
import {
  InfoResponse,
  Player,
  PlayerResponse,
  Rule,
  RulesResponse,
} from '../types.ts';
import { fail, pass, Result } from './util.ts';

const query_gameserver = (
  gameserver: string,
  attempts = 1,
  timeout: number = 1000,
): GameServerQuery => {
  const split_gameserver = gameserver.split(':');
  const host = split_gameserver[0];
  const port = parseInt(split_gameserver[1]);

  return new GameServerQuery(host, port, attempts, timeout);
};

export const query_gameserver_info = async (
  gameserver: string,
  attempts = 1,
  timeout: number = 1000,
): Promise<Result<InfoResponse>> => {
  const result = await query_gameserver(gameserver, attempts, timeout).info();
  return result;
};

export const query_gameserver_players = async (
  gameserver: string,
  attempts = 1,
  timeout: number = 1000,
): Promise<Result<PlayerResponse>> => {
  const result = await query_gameserver(gameserver, attempts, timeout)
    .players();
  return result;
};

export const query_gameserver_rules = async (
  gameserver: string,
  attempts = 1,
  timeout: number = 1000,
): Promise<Result<RulesResponse>> => {
  const result = await query_gameserver(gameserver, attempts, timeout).rules();
  return result;
};

class GameServerQuery {
  #socket: PromiseSocket;

  #host: string;
  #port: number;
  #attempts: number;
  #timeout: number;

  constructor(
    host: string,
    private port: number,
    attempts: number,
    timeout: number,
  ) {
    this.#host = host;
    this.#port = port;
    this.#attempts = attempts;
    this.#timeout = timeout;

    this.#socket = new PromiseSocket(attempts, timeout);
  }

  info = async (): Promise<Result<InfoResponse>> => {
    let buffer: Uint8Array;
    const response = await this.#socket.send(
      this.#build_info_packet(),
      this.#host,
      this.#port,
    );

    if (!response.ok) {
      this.#socket.close();
      return fail(response.error);
    } else {
      buffer = response.value;
    }

    if (this.#is_challenge_response(buffer)) {
      buffer = buffer.slice(5);
      const challenge = buffer;
      const response = await this.#socket.send(
        this.#build_info_packet(challenge),
        this.#host,
        this.#port,
      );

      if (!response.ok) {
        this.#socket.close();
        return fail(response.error);
      }

      buffer = response.value;
    }

    this.#socket.close();
    return pass(this.#parse_info_buffer(buffer));
  };

  players = async (): Promise<Result<PlayerResponse>> => {
    let buffer: Uint8Array;
    let got_player_response = false;
    let challenge_tries = 0;

    do {
      const challenge_buffer_response = await this.#socket.send(
        this.#build_packet(Uint8Array.from([0x55])),
        this.#host,
        this.#port,
      );

      if (!challenge_buffer_response.ok) {
        this.#socket.close();
        return fail(challenge_buffer_response.error);
      }

      const challenge_buffer = challenge_buffer_response.value;
      const challenge = challenge_buffer.slice(5);

      const response = await this.#socket.send(
        this.#build_packet(Uint8Array.from([0x55]), challenge),
        this.#host,
        this.#port,
      );

      if (!response.ok) {
        this.#socket.close();
        return fail(response.error);
      }

      buffer = response.value;

      if (!this.#is_challenge_response(buffer)) {
        got_player_response = true;
      }

      challenge_tries++;
    } while (!got_player_response && challenge_tries < 5);

    this.#socket.close();

    if (this.#is_challenge_response(buffer)) {
      throw new Error('Server kept sending challenge responses.');
    }

    const parsed_player = this.#parse_player_buffer(buffer);
    return pass(parsed_player);
  };

  rules = async (): Promise<Result<RulesResponse>> => {
    const challenge_buffer_response = await this.#socket.send(
      this.#build_packet(Uint8Array.from([0x56])),
      this.#host,
      this.#port,
    );

    if (!challenge_buffer_response.ok) {
      this.#socket.close();
      return fail(challenge_buffer_response.error);
    }

    const challenge_buffer = challenge_buffer_response.value;
    const challenge = challenge_buffer.slice(5);

    const response = await this.#socket.send(
      this.#build_packet(Uint8Array.from([0x56]), challenge),
      this.#host,
      this.#port,
    );

    if (!response.ok) {
      this.#socket.close();
      return fail(response.error);
    }

    const buffer = response.value;
    this.#socket.close();

    const parsed_rules = this.#parse_rules_buffer(buffer);
    return pass(parsed_rules);
  };

  #build_info_packet = (challenge?: Uint8Array): Uint8Array => {
    const encoded = new TextEncoder().encode('Source Engine Query');
    let packet = Uint8Array.from([
      0xFF,
      0xFF,
      0xFF,
      0xFF,
      0x54,
      ...encoded,
      0x00,
    ]);

    if (challenge) packet = Uint8Array.from([...packet, ...challenge]);

    return packet;
  };

  #build_packet = (header: Uint8Array, challenge?: Uint8Array): Uint8Array => {
    let packet = Uint8Array.from([
      0xFF,
      0xFF,
      0xFF,
      0xFF,
      ...header,
    ]);

    packet = challenge
      ? Uint8Array.from([...packet, ...challenge])
      : Uint8Array.from([...packet, 0xFF, 0xFF, 0xFF, 0xFF]);
    return packet;
  };

  #is_challenge_response = (buffer: Uint8Array): boolean => {
    const challenge = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0x41]);
    if (buffer.length < challenge.length) return false;

    for (let i = 0; i < challenge.length; i++) {
      if (buffer[i] !== challenge[i]) return false;
    }

    return true;
  };

  #parse_info_buffer = (buffer: Uint8Array): InfoResponse => {
    const info_response: Partial<InfoResponse> = {};
    buffer = buffer.slice(5);
    [info_response.protocol, buffer] = this.#read_uint8(buffer);
    [info_response.name, buffer] = this.#read_string(buffer);
    [info_response.map, buffer] = this.#read_string(buffer);
    [info_response.folder, buffer] = this.#read_string(buffer);
    [info_response.game, buffer] = this.#read_string(buffer);
    [info_response.app_id, buffer] = this.#read_int16(buffer);
    [info_response.players, buffer] = this.#read_uint8(buffer);
    [info_response.max_players, buffer] = this.#read_uint8(buffer);
    [info_response.bots, buffer] = this.#read_uint8(buffer);

    info_response.server_type = new TextDecoder().decode(buffer.subarray(0, 1));
    buffer = buffer.slice(1);

    info_response.environment = new TextDecoder().decode(buffer.subarray(0, 1));
    buffer = buffer.slice(1);

    [info_response.visibility, buffer] = this.#read_uint8(buffer);
    [info_response.vac, buffer] = this.#read_uint8(buffer);
    [info_response.version, buffer] = this.#read_string(buffer);

    if (buffer.length > 1) {
      let edf: number;
      [edf, buffer] = this.#read_uint8(buffer);
      if (edf & 0x80) [info_response.port, buffer] = this.#read_int16(buffer);
      if (edf & 0x10) buffer = buffer.slice(8);
      if (edf & 0x40) {
        [info_response.spectator_port, buffer] = this.#read_uint8(buffer);
        [info_response.spectator_name, buffer] = this.#read_string(buffer);
      }
      if (edf & 0x20) {
        [info_response.keywords, buffer] = this.#read_string(buffer);
      }
      if (edf & 0x01) {
        [info_response.game_id, buffer] = this.#read_uint64(buffer);
        buffer = buffer.slice(8);
      }
    }

    return info_response as InfoResponse;
  };

  #parse_player_buffer = (buffer: Uint8Array): PlayerResponse => {
    const player_response: Partial<PlayerResponse> = {};
    buffer = buffer.slice(5);
    [player_response.player_count, buffer] = this.#read_uint8(buffer);

    player_response.players = [];
    for (let i = 0; i < player_response.player_count; i++) {
      const player: Partial<Player> = {};
      [player.index, buffer] = this.#read_uint8(buffer);
      [player.name, buffer] = this.#read_string(buffer);
      [player.score, buffer] = this.#read_int32(buffer);
      [player.duration, buffer] = this.#read_float(buffer);

      player_response.players.push(player as Player);
    }

    return player_response as PlayerResponse;
  };

  #parse_rules_buffer = (buffer: Uint8Array): RulesResponse => {
    const rules_response: Partial<RulesResponse> = {};
    buffer = buffer.slice(5);
    [rules_response.rule_count, buffer] = this.#read_int16(buffer);

    rules_response.rules = [];
    for (let i = 0; i < rules_response.rule_count; i++) {
      const rule: Partial<Rule> = {};
      [rule.name, buffer] = this.#read_string(buffer);
      [rule.value, buffer] = this.#read_string(buffer);

      rules_response.rules.push(rule as Rule);
    }

    return rules_response as RulesResponse;
  };

  #read_string = (buffer: Uint8Array): [string, Uint8Array] => {
    const end = buffer.indexOf(0x00);
    return [
      new TextDecoder().decode(buffer.subarray(0, end)),
      buffer.subarray(end + 1),
    ];
  };

  #read_uint8 = (buffer: Uint8Array): [number, Uint8Array] => {
    return [buffer[0], buffer.subarray(1)];
  };

  #read_int16 = (buffer: Uint8Array): [number, Uint8Array] => {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    return [view.getInt16(0, true), buffer.subarray(2)];
  };

  #read_int32 = (buffer: Uint8Array): [number, Uint8Array] => {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    return [view.getInt32(0, true), buffer.subarray(4)];
  };

  #read_uint64 = (buffer: Uint8Array): [bigint, Uint8Array] => {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    return [view.getBigInt64(0, true), buffer.subarray(8)];
  };

  #read_float = (buffer: Uint8Array): [number, Uint8Array] => {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    return [view.getFloat32(0, true), buffer.subarray(4)];
  };
}
