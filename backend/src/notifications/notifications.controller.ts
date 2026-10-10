import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryFlag } from '../common/http/query-flag.js';
import { IsEnum, IsString, Length } from 'class-validator';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import { Errors } from '../common/errors/app-error.js';
import type { AuthContext } from '../common/http/request.js';
import { Page, clampLimit, decodeCursor } from '../common/pagination/cursor.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import { PrismaService } from '../database/prisma.service.js';

class NotificationsQueryDto extends PageQueryDto {
  @QueryFlag()
  unreadOnly?: boolean;
}

class RegisterDeviceDto {
  /** The FCM registration token or APNs device token. */
  @IsString()
  @Length(20, 512)
  token!: string;

  @IsEnum(['ANDROID', 'IOS', 'WEB'])
  platform!: 'ANDROID' | 'IOS' | 'WEB';
}

const cursorSchema = z.object({ t: z.string(), id: z.string() });

@ApiTags('notifications')
@ApiBearerAuth('user')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'In-app notifications, newest first', description: 'Cursor-paginated.' })
  async list(@CurrentUser() user: AuthContext, @Query() q: NotificationsQueryDto) {
    const limit = clampLimit(q.limit);
    const after = decodeCursor(q.cursor, cursorSchema);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId: user.userId,
        ...(q.unreadOnly ? { readAt: null } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: new Date(after.t) } },
                { createdAt: new Date(after.t), id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return Page.fromRows(
      rows,
      limit,
      (r) => ({ t: r.createdAt.toISOString(), id: r.id }),
      (n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        read: !!n.readAt,
        createdAt: n.createdAt.toISOString(),
      }),
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many notifications are unread' })
  async unread(@CurrentUser() user: AuthContext) {
    return {
      count: await this.prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
    };
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark everything as read' })
  async readAll(@CurrentUser() user: AuthContext) {
    const res = await this.prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: res.count };
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one notification as read' })
  async read(
    @CurrentUser() user: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const exists = await this.prisma.notification.count({ where: { id, userId: user.userId } });
    if (!exists) throw Errors.notFound('Notification');
    await this.prisma.notification.updateMany({
      where: { id, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  @Post('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this phone for push notifications' })
  async registerDevice(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    // A token belongs to one account at a time: signing in elsewhere moves it.
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      update: {
        userId: user.userId,
        sessionId: user.sessionId,
        platform: dto.platform,
        disabledAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        userId: user.userId,
        sessionId: user.sessionId,
        platform: dto.platform,
        token: dto.token,
      },
    });
  }

  @Delete('devices/:token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop push notifications to this phone' })
  async unregisterDevice(
    @CurrentUser() user: AuthContext,
    @Param('token') token: string,
  ): Promise<void> {
    await this.prisma.pushDevice.updateMany({
      where: { token, userId: user.userId },
      data: { disabledAt: new Date() },
    });
  }
}
