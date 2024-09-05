export type Passed<T> = { ok: true; value: T; error: null };
export type Failed<E = Error> = { ok: false; value: null; error: E };
export type Result<T, E = Error> = Passed<T> | Failed<E>;

export const pass = <T>(val: T): Passed<T> => ({
  ok: true,
  value: val,
  error: null,
});

export const fail = <E>(val: E): Failed<E> => ({
  ok: false,
  value: null,
  error: val,
});
