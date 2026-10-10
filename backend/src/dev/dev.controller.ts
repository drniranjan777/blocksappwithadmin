import { Controller, Delete, Get, HttpCode, Query, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../common/decorators/route-metadata.js';
import { Errors } from '../common/errors/app-error.js';
import { clientIp } from '../common/http/request.js';
import { DevOutbox } from '../providers/outbox.service.js';

/** Loopback, link-local and RFC 1918 addresses (IPv4, plus IPv6 loopback and unique-local). */
export function isLocalNetwork(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (v4 === '::1' || v4 === '127.0.0.1' || /^fe80:/i.test(v4) || /^f[cd][0-9a-f]{2}:/i.test(v4))
    return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(v4);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * Lets a developer read the "sent" e-mails and texts, so the one-time codes of a
 * local build can be typed into the app. Only registered outside production and
 * never listed in the API docs; and even then it answers only callers on the
 * local network, in case a development server is reachable from outside.
 */
@ApiExcludeController()
@Public()
@Controller('dev/outbox')
export class DevController {
  constructor(private readonly outbox: DevOutbox) {}

  @Get()
  list(@Req() req: Request, @Query('to') to?: string) {
    this.guard(req);
    const rows = to ? this.outbox.to(to) : this.outbox.all();
    return rows
      .slice(-50)
      .reverse()
      .map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  }

  @Delete()
  @HttpCode(204)
  clear(@Req() req: Request): void {
    this.guard(req);
    this.outbox.clear();
  }

  private guard(req: Request): void {
    const ip = clientIp(req);
    if (!ip || !isLocalNetwork(ip)) throw Errors.notFound('Route');
  }
}
