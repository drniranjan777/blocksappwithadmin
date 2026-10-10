import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/route-metadata.js';
import { type AuthContext, clientIp, userAgentOf } from '../../common/http/request.js';
import { KycFilesService } from './kyc-files.service.js';
import { SubmitKycDto, UploadDocumentDto } from './kyc.dto.js';
import { KycService } from './kyc.service.js';

@ApiTags('kyc')
@ApiBearerAuth('user')
@Controller('kyc')
export class KycController {
  constructor(
    private readonly kyc: KycService,
    private readonly files: KycFilesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Where your identity verification stands',
    description:
      'Masked: your name and PAN are shown with most characters hidden. `NOT_STARTED` if you have not applied.',
  })
  status(@CurrentUser() u: AuthContext) {
    return this.kyc.status(u.userId);
  }

  @Get('config')
  @ApiOperation({
    summary: 'Which documents are accepted for whom',
    description:
      'Aadhaar is not accepted anywhere: a 12-digit number shaped like one is refused in any field.',
  })
  config() {
    return this.kyc.config();
  }

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('documents/upload')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get a signed address to upload a scan of a document',
    description:
      'PDF, JPEG or PNG up to 8 MB, straight to a private bucket. Then call `documents/{fileId}/complete`, and name the `fileId` in your submission.',
  })
  upload(@CurrentUser() u: AuthContext, @Body() dto: UploadDocumentDto) {
    this.kyc.assertEnabled();
    return this.files.presign(u.userId, dto.contentType, dto.sizeBytes);
  }

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('documents/:fileId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check the uploaded scan (its real file type and size)' })
  complete(@CurrentUser() u: AuthContext, @Param('fileId', new ParseUUIDPipe()) fileId: string) {
    this.kyc.assertEnabled();
    return this.files.complete(u.userId, fileId);
  }

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('submissions')
  @ApiOperation({
    summary: 'Submit your details for verification',
    description:
      'An identity provider checks them. A clear match is verified at once; a doubtful one goes to a person; a failed one is rejected with a reason code. You cannot mark yourself verified, and nobody can mark a case verified that the provider did not clear for review.',
  })
  submit(@CurrentUser() u: AuthContext, @Body() dto: SubmitKycDto, @Req() req: Request) {
    return this.kyc.submit(u.userId, dto, { ip: clientIp(req), userAgent: userAgentOf(req) });
  }
}
