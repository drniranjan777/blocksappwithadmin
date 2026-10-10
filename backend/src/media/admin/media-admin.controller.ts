import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { PageQueryDto } from '../../common/pagination/page-query.dto.js';
import { MediaAdminService } from './media-admin.service.js';

class JobsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'CANCELLED'])
  status?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'RETRYING' | 'CANCELLED';

  @IsOptional()
  @IsIn(['VALIDATE', 'TRANSCODE', 'THUMBNAIL', 'MODERATE', 'DELETE', 'COMPOSE'])
  type?: 'VALIDATE' | 'TRANSCODE' | 'THUMBNAIL' | 'MODERATE' | 'DELETE' | 'COMPOSE';
}

class DecisionDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsString()
  @Length(10, 500)
  note!: string;
}

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-media')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/media')
export class MediaAdminController {
  constructor(private readonly media: MediaAdminService) {}

  @RequirePermissions('media.read')
  @Get('jobs')
  @ApiOperation({
    summary: 'Media processing jobs',
    description: 'Filter by status or type. `FAILED` is the list to look at.',
  })
  jobs(@Query() q: JobsQueryDto) {
    return this.media.jobs(q);
  }

  @RequirePermissions('media.retry')
  @Post('jobs/:id/retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Retry a failed job',
    description: 'Not for a file that was refused; only for one that failed to process.',
  })
  retry(@CurrentAdmin() a: AdminAuthContext, @Param('id', uuid()) id: string, @Req() req: Request) {
    return this.media.retry(a, id, meta(req));
  }

  @RequirePermissions('content.moderate')
  @Get('review')
  @ApiOperation({
    summary: 'Photos and videos waiting for a person to look at',
    description: 'Oldest first, with signed links to the processed copies (never the original).',
  })
  review(@Query() q: PageQueryDto) {
    return this.media.reviewQueue(q);
  }

  @RequirePermissions('content.moderate')
  @Post('review/:id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve or refuse a photo or video',
    description:
      'Releases or takes down whatever uses it (a post, story, avatar or reel clip) the same way an automated decision would. A note is required and the decision is audited.',
  })
  decide(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: DecisionDto,
    @Req() req: Request,
  ) {
    return this.media.decide(a, id, dto.decision, dto.note, meta(req));
  }
}
