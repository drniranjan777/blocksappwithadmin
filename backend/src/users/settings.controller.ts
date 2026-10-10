import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PrismaService } from '../database/prisma.service.js';

const WHO = ['everyone', 'followers', 'nobody'] as const;

class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['en', 'hi', 'te'])
  language?: string;

  @IsOptional()
  @IsIn(WHO)
  whoCanComment?: (typeof WHO)[number];

  @IsOptional()
  @IsIn(WHO)
  whoCanMessage?: (typeof WHO)[number];

  @IsOptional()
  @IsBoolean()
  showSensitiveContent?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;
}

/**
 * Preferences that are not about security (those live under `/security`):
 * language, who may comment or message, what to show, and notification switches.
 */
@ApiTags('settings')
@ApiBearerAuth('user')
@Controller('users/me/settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'My preferences' })
  async get(@CurrentUser() user: AuthContext) {
    return this.read(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Change my preferences (send only what changes)' })
  async update(@CurrentUser() user: AuthContext, @Body() dto: UpdateSettingsDto) {
    const data = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    await this.prisma.userSettings.upsert({
      where: { userId: user.userId },
      update: data,
      create: { userId: user.userId, ...data },
    });
    return this.read(user.userId);
  }

  private async read(userId: string) {
    const s = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return {
      language: s.language,
      whoCanComment: s.whoCanComment,
      whoCanMessage: s.whoCanMessage,
      showSensitiveContent: s.showSensitiveContent,
      pushEnabled: s.pushEnabled,
      emailNotifications: s.emailNotifications,
    };
  }
}
