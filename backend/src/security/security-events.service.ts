import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type {
  DevicePlatform,
  Prisma,
  SecurityEventType,
  SecuritySeverity,
} from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service.js';
import type { NoticeTemplate } from '../notifications/templates.js';

export interface SecurityEventInput {
  userId: string;
  type: SecurityEventType;
  severity?: SecuritySeverity;
  sessionId?: string | undefined;
  ip?: string | undefined;
  deviceLabel?: string | undefined;
  locationLabel?: string | undefined;
  riskScore?: number;
  /** Non-sensitive context. Never a code, token, password or full identifier. */
  details?: Prisma.InputJsonValue;
  /** Also tell the user (in-app, plus e-mail and push per their settings). */
  notify?: { template: NoticeTemplate; vars?: Record<string, string | number> };
}

export function deviceLabelOf(device?: {
  deviceName?: string | undefined;
  platform?: DevicePlatform | undefined;
}): string | undefined {
  if (!device) return undefined;
  const platform =
    device.platform && device.platform !== 'UNKNOWN' ? ` (${device.platform.toLowerCase()})` : '';
  return device.deviceName
    ? `${device.deviceName}${platform}`
    : platform
      ? platform.trim().slice(1, -1)
      : undefined;
}

/**
 * Writes the account-security history a user sees under Login Activity, and
 * (when asked) tells them about it. Recording is the primary duty: a failure to
 * *notify* never loses the event.
 */
@Injectable()
export class SecurityEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async record(input: SecurityEventInput) {
    const event = await this.prisma.securityEvent.create({
      data: {
        userId: input.userId,
        type: input.type,
        severity: input.severity ?? 'INFO',
        sessionId: input.sessionId ?? null,
        ip: input.ip ?? null,
        deviceLabel: input.deviceLabel ?? null,
        locationLabel: input.locationLabel ?? null,
        riskScore: input.riskScore ?? 0,
        ...(input.details === undefined ? {} : { details: input.details }),
      },
    });
    if (input.notify) {
      try {
        await this.notifications.notify({
          userId: input.userId,
          type: input.severity === 'INFO' ? 'SYSTEM' : 'SECURITY_ALERT',
          template: input.notify.template,
          ...(input.notify.vars ? { vars: input.notify.vars } : {}),
          severity: input.severity ?? 'INFO',
          data: { securityEventId: event.id },
          dedupeKey: `sec:${event.id}`,
        });
      } catch {
        // The event is already stored; a notification failure is not the user's problem.
      }
    }
    return event;
  }
}
