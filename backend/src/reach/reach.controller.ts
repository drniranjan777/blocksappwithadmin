import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { publicLadder } from './reach-config.js';
import { ReachConfigService } from './reach-config.service.js';
import { ReachEventsService } from './reach-events.service.js';
import { ReachInsightService } from './reach-insight.service.js';
import { IngestEventsDto } from './reach.dto.js';

@ApiTags('reach')
@ApiBearerAuth('user')
@Controller('reach')
export class ReachController {
  constructor(
    private readonly config: ReachConfigService,
    private readonly events: ReachEventsService,
    private readonly insight: ReachInsightService,
  ) {}

  @Get('ladder')
  @ApiOperation({
    summary: 'What unlocks each rung of the Reach Ladder',
    description:
      'The thresholds in force now, so the app never hard-codes them. Weights, fraud limits and reward economics are not published.',
  })
  async ladder() {
    const active = await this.config.active();
    return { version: active.version, ...publicLadder(active.config) };
  }

  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('events')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Report what was on screen, and for how long',
    description:
      'Up to 50 reports per call: `IMPRESSION` (it was shown) or `WATCH` (how long, in ms). The server decides what counts: whether a view is qualified, where the viewer is (from their own profile), and whether it looks genuine. Your own content, content you cannot see, and repeats are ignored. The reply only says how many reports were read, so it cannot be used to learn what counts.',
  })
  async ingest(@CurrentUser() u: AuthContext, @Body() dto: IngestEventsDto) {
    const received = await this.events.ingest(
      u.userId,
      u.sessionId,
      dto.events.map((e) => ({ ...e, watchMs: e.watchMs ?? 0 })),
    );
    return { received };
  }

  @Get('content/:kind/:id')
  @ApiOperation({
    summary: 'How your post or reel is doing on the Reach Ladder',
    description:
      'Only for your own content: its rung, qualified reach, score, how each signal added to it, and what is missing for the next rung.',
  })
  progress(
    @CurrentUser() u: AuthContext,
    @Param('kind') kind: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.insight.progress(u.userId, kind, id);
  }
}
