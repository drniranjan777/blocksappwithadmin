import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service.js';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';

@ApiTags('users')
@ApiBearerAuth('user')
@Controller('users')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in account (contact details masked)' })
  me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user.userId);
  }
}
