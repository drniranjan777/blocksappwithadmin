import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AdminRoute,
  CurrentAdmin,
  RequirePermissions,
} from '../common/decorators/route-metadata.js';
import { type AdminAuthContext, clientIp, userAgentOf } from '../common/http/request.js';
import {
  CompleteAudioDto,
  CreateLicenceDto,
  CreateTrackDto,
  FileUploadDto,
  MusicReasonDto,
  SetRightsDto,
  StaffMusicListQueryDto,
  UpdateTrackDto,
} from './dto/music.dto.js';
import { MusicAdminService } from './music-admin.service.js';

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
const uuid = () => new ParseUUIDPipe();

@ApiTags('admin-music')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/music')
export class MusicAdminController {
  constructor(private readonly music: MusicAdminService) {}

  // ------------------------------------------------------------------ tracks --

  @RequirePermissions('music.read')
  @Get('tracks')
  @ApiOperation({
    summary: 'The music library',
    description: 'Cursor-paginated, newest first. Filter by status or title/artist.',
  })
  list(@Query() q: StaffMusicListQueryDto) {
    return this.music.list(q);
  }

  @RequirePermissions('music.read')
  @Get('tracks/:id')
  @ApiOperation({ summary: 'One track, with its rights' })
  get(@Param('id', uuid()) trackId: string) {
    return this.music.get(trackId);
  }

  @RequirePermissions('music.manage')
  @Post('tracks')
  @ApiOperation({
    summary: 'Add a track (as a draft)',
    description:
      'Starts as licensed-from-someone-else: it cannot go live until a licence is recorded, or licensing marks it platform-owned.',
  })
  create(@CurrentAdmin() a: AdminAuthContext, @Body() dto: CreateTrackDto, @Req() req: Request) {
    return this.music.create(a, dto, meta(req));
  }

  @RequirePermissions('music.manage')
  @Patch('tracks/:id')
  @ApiOperation({
    summary: 'Edit a track',
    description: 'Changing countries or uses needs a `reason`.',
  })
  update(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: UpdateTrackDto,
    @Req() req: Request,
  ) {
    return this.music.update(a, trackId, dto, meta(req));
  }

  @RequirePermissions('music.licences.manage')
  @Put('tracks/:id/rights')
  @ApiOperation({
    summary: 'Set who owns the rights',
    description:
      'A licensing decision. Moving to rights that need a licence takes a live track down until one is running.',
  })
  rights(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: SetRightsDto,
    @Req() req: Request,
  ) {
    return this.music.setRights(a, trackId, dto.rightsType, dto.reason, meta(req));
  }

  // ------------------------------------------------------------------- files --

  @RequirePermissions('music.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('tracks/:id/audio/upload')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get a signed address to upload the audio to',
    description:
      'MP3, M4A/AAC, WAV, FLAC or OGG, up to 40 MB. Upload to the address, then call `audio/complete`.',
  })
  audioUpload(@Param('id', uuid()) trackId: string, @Body() dto: FileUploadDto) {
    return this.music.presign(trackId, 'audio', dto);
  }

  @RequirePermissions('music.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tracks/:id/audio/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check the uploaded audio and prepare the preview',
    description:
      'Verifies the real file type, re-encodes the full track (server only) and cuts the 30-second preview.',
  })
  audioComplete(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: CompleteAudioDto,
    @Req() req: Request,
  ) {
    return this.music.completeAudio(a, trackId, dto, meta(req));
  }

  @RequirePermissions('music.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('tracks/:id/cover/upload')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get a signed address to upload the cover to',
    description: 'JPEG, PNG or WebP, up to 5 MB.',
  })
  coverUpload(@Param('id', uuid()) trackId: string, @Body() dto: FileUploadDto) {
    return this.music.presign(trackId, 'cover', dto);
  }

  @RequirePermissions('music.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tracks/:id/cover/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the uploaded cover and resize it' })
  coverComplete(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Req() req: Request,
  ) {
    return this.music.completeCover(a, trackId, meta(req));
  }

  // ------------------------------------------------------------ availability --

  @RequirePermissions('music.manage')
  @Post('tracks/:id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make a draft track available',
    description:
      'Needs audio, at least one country and use, and (for licensed music) a running licence covering every chosen country.',
  })
  activate(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: MusicReasonDto,
    @Req() req: Request,
  ) {
    return this.music.activate(a, trackId, dto.reason, meta(req));
  }

  @RequirePermissions('music.manage')
  @Post('tracks/:id/suspend')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a track down',
    description: 'Reels already published with it keep playing; no new reel can use it.',
  })
  suspend(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: MusicReasonDto,
    @Req() req: Request,
  ) {
    return this.music.suspend(a, trackId, dto.reason, meta(req));
  }

  @RequirePermissions('music.manage')
  @Post('tracks/:id/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Put a suspended or expired track back',
    description: 'Subject to the same checks as going live.',
  })
  restore(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: MusicReasonDto,
    @Req() req: Request,
  ) {
    return this.music.restore(a, trackId, dto.reason, meta(req));
  }

  // ---------------------------------------------------------------- licences --

  @RequirePermissions('music.licences.read')
  @Get('tracks/:id/licences')
  @ApiOperation({ summary: 'Licences behind a track' })
  licences(@Param('id', uuid()) trackId: string) {
    return this.music.licences(trackId);
  }

  @RequirePermissions('music.licences.manage')
  @Post('tracks/:id/licences')
  @ApiOperation({
    summary: 'Record a licence (pending)',
    description: 'No terms or amounts are stored, only who, which contract, where and when.',
  })
  createLicence(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) trackId: string,
    @Body() dto: CreateLicenceDto,
    @Req() req: Request,
  ) {
    return this.music.createLicence(a, trackId, dto, meta(req));
  }

  @RequirePermissions('music.licences.manage')
  @Post('licences/:id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a licence', description: 'Only on or after its start date.' })
  activateLicence(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) licenceId: string,
    @Body() dto: MusicReasonDto,
    @Req() req: Request,
  ) {
    return this.music.activateLicence(a, licenceId, dto.reason, meta(req));
  }

  @RequirePermissions('music.licences.manage')
  @Post('licences/:id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revoke a licence',
    description: 'A live track with no other running licence is taken down at once.',
  })
  revokeLicence(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) licenceId: string,
    @Body() dto: MusicReasonDto,
    @Req() req: Request,
  ) {
    return this.music.revokeLicence(a, licenceId, dto.reason, meta(req));
  }

  @RequirePermissions('music.licences.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('licences/:id/document/upload')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get a signed address to upload the signed licence to',
    description: 'PDF, JPEG or PNG, up to 10 MB. Kept private.',
  })
  documentUpload(@Param('id', uuid()) licenceId: string, @Body() dto: FileUploadDto) {
    return this.music.presignDocument(licenceId, dto);
  }

  @RequirePermissions('music.licences.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('licences/:id/document/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the uploaded licence document' })
  documentComplete(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) licenceId: string,
    @Req() req: Request,
  ) {
    return this.music.completeDocument(a, licenceId, meta(req));
  }

  @RequirePermissions('music.licences.read')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('licences/:id/document')
  @ApiOperation({
    summary: 'A two-minute link to the licence document',
    description: 'Each view is written to the sensitive audit trail.',
  })
  document(
    @CurrentAdmin() a: AdminAuthContext,
    @Param('id', uuid()) licenceId: string,
    @Req() req: Request,
  ) {
    return this.music.viewDocument(a, licenceId, meta(req));
  }
}
