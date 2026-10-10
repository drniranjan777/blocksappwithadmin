import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import { PrismaService } from '../database/prisma.service.js';
import { CreatorProfileService } from './creator-profile.service.js';
import { ContentQueryDto } from './earnings.dto.js';
import { EarningsService } from './earnings.service.js';

@ApiTags('creator')
@ApiBearerAuth('user')
@Controller()
export class CreatorController {
  constructor(
    private readonly creators: CreatorProfileService,
    private readonly earnings: EarningsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('creator/dashboard')
  @ApiOperation({
    summary: 'Creator Studio: reach, the Ladder, eligibility and earnings in one call',
    description:
      'Everything is computed on the server. `earnings.estimated` is a projection for the cycle in progress, not money and not a promise.',
  })
  async dashboard(@CurrentUser() u: AuthContext) {
    const [profile, eligibility, levels, earnings] = await Promise.all([
      this.prisma.creatorProfile.findUnique({ where: { userId: u.userId } }),
      this.creators.eligibility(u.userId),
      this.creators.levelCounts(u.userId),
      this.earnings.summary(u.userId),
    ]);
    return {
      monetization: {
        status: eligibility.status,
        eligible: eligibility.eligible,
        requirements: eligibility.requirements,
        suspended: eligibility.suspended,
      },
      reach: {
        qualifiedReach30d: profile?.qualifiedReach30d ?? 0,
        bestLevel: profile?.bestReachLevel ?? 'DISTRICT',
        itemsByLevel: levels,
      },
      earnings: {
        estimated: earnings.estimated,
        pending: earnings.pending,
        finalized: earnings.finalized,
        available: earnings.available,
        currency: earnings.currency,
        notice: earnings.notice,
      },
    };
  }

  @Get('creator/eligibility')
  @ApiOperation({
    summary: 'Whether rewards accrue to you, and what is still missing',
    description:
      'Decided by the server against the thresholds in force. Suspension by staff is shown but not explained here.',
  })
  eligibility(@CurrentUser() u: AuthContext) {
    return this.creators.eligibility(u.userId);
  }

  @Get('creator/content')
  @ApiOperation({
    summary: 'Your published reels or posts with where each stands on the Reach Ladder',
    description: 'Cursor-paginated, newest first. `kind` is `reel` (default) or `post`.',
  })
  content(@CurrentUser() u: AuthContext, @Query() q: ContentQueryDto) {
    return this.creators.content(u.userId, q.kind ?? 'reel', q);
  }

  @Get('earnings/summary')
  @ApiOperation({
    summary: 'Estimated, pending, finalized and available earnings, kept apart',
    description:
      '`estimated` moves during a cycle and is not money. `pending` is fixed at the close of a cycle, awaiting release. `finalized` has been released into the ledger. `available` is what the ledger says you are owed now.',
  })
  summary(@CurrentUser() u: AuthContext) {
    return this.earnings.summary(u.userId);
  }

  @Get('earnings/history')
  @ApiOperation({ summary: 'Your earnings cycle by cycle (cursor-paginated, newest first)' })
  history(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.earnings.history(u.userId, q);
  }

  @Get('earnings/ledger')
  @ApiOperation({
    summary: 'Every movement of your balance (cursor-paginated, newest first)',
    description:
      'Credits are positive, debits negative. The ledger is append-only: nothing here can be edited or removed.',
  })
  ledger(@CurrentUser() u: AuthContext, @Query() q: PageQueryDto) {
    return this.earnings.ledgerOf(u.userId, q);
  }
}
