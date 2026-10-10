import { rm } from 'node:fs/promises';
import { Logger } from '@nestjs/common';

const logger = new Logger('TempDir');

/**
 * Removes a scratch directory once the work in it is finished, and **never throws**.
 *
 * The work has already succeeded or failed by the time this runs, and a failure to tidy up must not
 * replace that outcome: a finished upload, render or job would otherwise be reported as an error
 * because a file was still locked for a moment (an encoder that has just exited, a virus scanner, an
 * indexer; common on Windows). Locked files are retried briefly; anything still left is logged and
 * is for the periodic clean-up of the temp directory, not for the person who asked.
 */
export async function removeTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    logger.warn(`could not remove ${dir}: ${(error as Error).message}`);
  }
}
