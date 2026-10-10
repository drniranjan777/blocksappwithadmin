import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserSessionService } from '../auth/user-session.service.js';
import { maskIp } from '../common/crypto/mask.js';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import { Errors } from '../common/errors/app-error.js';
import type { AuthContext } from '../common/http/request.js';
import { SecurityEventService } from '../security/security-events.service.js';

@ApiTags('sessions')
@ApiBearerAuth('user')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: UserSessionService,
    private readonly events: SecurityEventService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Devices signed in to this account' })
  async list(@CurrentUser() user: AuthContext) {
    const rows = await this.sessions.listForUser(user.userId);
    return rows.map((s) => ({
      id: s.id,
      deviceName: s.deviceName ?? 'Unknown device',
      platform: s.platform,
      appVersion: s.appVersion,
      locationLabel: s.locationLabel,
      // The owner sees a partly hidden address: enough to recognise, not to reuse.
      ip: s.ip ? maskIp(s.ip) : null,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === user.sessionId,
    }));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign one device out' })
  async revoke(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    // Ownership is part of the query: someone else's session id is simply "not found".
    const ok = await this.sessions.revoke(
      user.userId,
      id,
      id === user.sessionId ? 'LOGOUT' : 'USER_REVOKED',
    );
    if (!ok) throw Errors.notFound('Session');
    await this.events.record({ userId: user.userId, type: 'SESSION_REVOKED', sessionId: id });
  }

  @Post('revoke-others')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign out every device except this one' })
  async revokeOthers(@CurrentUser() user: AuthContext) {
    const count = await this.sessions.revokeOthers(user.userId, user.sessionId, 'LOGOUT_OTHERS');
    await this.events.record({
      userId: user.userId,
      type: 'ALL_SESSIONS_REVOKED',
      sessionId: user.sessionId,
      details: { count },
      ...(count > 0
        ? {
            severity: 'WARNING' as const,
            notify: {
              template: 'security_sessions_revoked' as const,
              vars: { count, time: new Date().toUTCString() },
            },
          }
        : {}),
    });
    return { signedOut: count };
  }
}
