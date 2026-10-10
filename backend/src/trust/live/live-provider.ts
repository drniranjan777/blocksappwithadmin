import { Injectable } from '@nestjs/common';

/**
 * The seam to a real-time video service.
 *
 * BLOCKS does not stream live video yet, so there is no service to talk to: this is the contract a
 * live provider will have to meet when one is chosen, and the staff tools are built against it.
 * Ending a session always happens in our database first (the session is marked terminated, and a
 * provider must treat that as authoritative, refusing to carry on or to restart it). Telling the
 * provider to cut the stream is the second step, and its answer is reported honestly: `confirmed`
 * is true only if the provider said it stopped.
 */
export abstract class LiveProvider {
  abstract terminate(sessionId: string, reason: string): Promise<{ confirmed: boolean }>;
}

/** Used while there is no live service. It confirms nothing, because there is nothing to confirm. */
@Injectable()
export class NullLiveProvider extends LiveProvider {
  async terminate(): Promise<{ confirmed: boolean }> {
    return { confirmed: false };
  }
}
