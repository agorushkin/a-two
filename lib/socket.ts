import { createSocket, Socket } from 'node:dgram';
import { Buffer } from 'node:buffer';

import { fail, pass, Result } from './util.ts';

export class PromiseSocket {
  #socket: Socket;
  #attempts: number;
  #timeout: number;

  constructor(attempts: number, timeout: number) {
    this.#attempts = attempts;
    this.#timeout = timeout;

    this.#socket = createSocket('udp4');
  }

  send = async (
    buffer: Uint8Array,
    host: string,
    port: number,
  ): Promise<Result<Uint8Array>> => {
    for (let i = 0; i < this.#attempts; i++) {
      try {
        const message_buffer = await this.#send(
          buffer,
          host,
          port,
          this.#timeout,
        );
        return pass(message_buffer);
      } catch (err) {
        if (i === this.#attempts - 1) return fail(err);
      }
    }

    return fail(new Error('This should never happen'));
  };

  close = () => {
    this.#socket.close();
  };

  #send = (
    buffer: Uint8Array,
    host: string,
    port: number,
    timeout: number,
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) =>
      (() => {
        this.#socket.send(buffer, port, host, (err) => {
          if (err) reject(err.message);

          const message_listener = (buffer: Buffer) => {
            this.#socket.removeListener('message', message_listener);
            this.#socket.removeListener('error', error_listener);
            clearTimeout(counter);
            return resolve(Uint8Array.from(buffer));
          };

          const error_listener = (err: Error) => {
            this.#socket.removeListener('message', message_listener);
            this.#socket.removeListener('error', error_listener);
            clearTimeout(counter);
            return reject(err.message);
          };

          const counter = setTimeout(() => {
            this.#socket.removeListener('message', message_listener);
            this.#socket.removeListener('error', error_listener);
            return reject('Timeout');
          }, timeout);

          this.#socket.on('message', message_listener);
          this.#socket.on('error', error_listener);
        });
      })()
    );
  };
}
