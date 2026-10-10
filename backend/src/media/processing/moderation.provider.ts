import { Injectable } from '@nestjs/common';
import { SystemSettingsService } from '../../common/settings/system-settings.service.js';

export type ModerationDecision = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface ModerationAssessment {
  decision: ModerationDecision;
  /** Why, as short machine-readable labels, for the moderation queue. */
  labels: string[];
}

/**
 * Looks at an image (a photo, or a still from a video) and says whether it can be
 * shown. The seam where an automated service (a cloud vision API, an in-house model)
 * plugs in; nothing else in the system knows which one is used.
 *
 *   APPROVE   fine to show
 *   REVIEW    a person must look before it is shown
 *   REJECT    clearly not acceptable; never shown
 */
export abstract class ModerationProvider {
  abstract readonly name: string;
  abstract assess(input: { localPath: string; mime: string }): Promise<ModerationAssessment>;
}

/**
 * Development only: approves everything, so the rest of the pipeline can be
 * exercised. A setting (`moderation.dev_decision`) lets a test or a developer force
 * another outcome. Production refuses to start with this selected.
 */
@Injectable()
export class DevModerationProvider extends ModerationProvider {
  readonly name = 'dev';
  constructor(private readonly settings: SystemSettingsService) {
    super();
  }
  async assess(): Promise<ModerationAssessment> {
    const forced = await this.settings.get<ModerationDecision | null>(
      'moderation.dev_decision',
      null,
    );
    if (forced === 'REVIEW' || forced === 'REJECT')
      return { decision: forced, labels: ['dev_forced'] };
    return { decision: 'APPROVE', labels: [] };
  }
}

/** Every upload waits for a person. Slow, and the safe default until automation is connected. */
@Injectable()
export class ManualModerationProvider extends ModerationProvider {
  readonly name = 'manual';
  async assess(): Promise<ModerationAssessment> {
    return { decision: 'REVIEW', labels: ['manual_review'] };
  }
}
