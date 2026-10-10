import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ReachAdminController } from './reach-admin.controller.js';
import { ReachCoreModule } from './reach-core.module.js';
import { ReachInsightService } from './reach-insight.service.js';
import { ReachScoringService } from './reach-scoring.service.js';
import { ReachController } from './reach.controller.js';

/** The Reach Ladder: the settings staff tune, the intake of view reports, and the scoring job. */
@Module({
  imports: [ReachCoreModule, AdminModule],
  controllers: [ReachController, ReachAdminController],
  providers: [ReachScoringService, ReachInsightService],
  exports: [ReachScoringService, ReachInsightService, ReachCoreModule],
})
export class ReachModule {}
