import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { PERMISSIONS, ROLES } from './permission-catalog.js';
import { syncRbac } from './sync-rbac.js';

/**
 * Keeps the database copy of the permission catalogue and the built-in roles in
 * step with the code, every time the API starts.
 *
 * The code is the source of truth (`permission-catalog.ts`). The tables exist so
 * roles can reference permissions by foreign key and so custom roles can be
 * stored. Syncing at start-up means a deploy that changes a role takes effect
 * without a separate step to forget, and a built-in role that someone edited by
 * hand in SQL is put back. Custom roles are never touched.
 */
@Injectable()
export class RbacSyncService implements OnModuleInit {
  private readonly logger = new Logger('RbacSync');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.sync();
  }

  async sync(): Promise<void> {
    await syncRbac(this.prisma);
    this.logger.log(
      `Permission catalogue in step: ${PERMISSIONS.length} permissions, ${ROLES.length} built-in roles`,
    );
  }
}
