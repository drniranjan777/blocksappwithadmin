/** A reason this file can never be processed (as opposed to "try again"). */
export class Rejected extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * "Not yet": the job is waiting for something else (a clip still being processed) and should
 * come back shortly. It is not a failure, so it does not use up one of the job's attempts.
 */
export class Deferred extends Error {
  constructor(
    readonly seconds: number,
    message = 'waiting for other work to finish',
  ) {
    super(message);
  }
}
