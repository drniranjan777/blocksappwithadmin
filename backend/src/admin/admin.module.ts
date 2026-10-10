import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AuditController } from './audit/audit.controller.js';
import { AuditQueryService } from './audit/audit-query.service.js';
import { AuditService } from './audit/audit.service.js';
import { AdminAuthController } from './auth/admin-auth.controller.js';
import { AdminAuthGuard } from './auth/admin-auth.guard.js';
import { AdminAuthService } from './auth/admin-auth.service.js';
import { AdminSessionService } from './auth/admin-session.service.js';
import { AppUsersController } from './app-users/app-users.controller.js';
import { AppUsersService } from './app-users/app-users.service.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { AdminPermissionsService } from './rbac/admin-permissions.service.js';
import { RbacSyncService } from './rbac/rbac-sync.service.js';
import { RolesController } from './roles/roles.controller.js';
import { RolesService } from './roles/roles.service.js';
import { SettingsAdminController } from './settings/settings-admin.controller.js';
import { SettingsAdminService } from './settings/settings-admin.service.js';
import { AdminMailer } from './users/admin-mailer.js';
import { AdminUsersController } from './users/admin-users.controller.js';
import { AdminUsersService } from './users/admin-users.service.js';

/**
 * The staff console's API: a separate realm from app users, with its own tokens,
 * sessions, sign-in (mandatory two-step verification), roles and audit trail.
 * Every route here is `@AdminRoute()`, so the app-user guard steps aside and
 * `AdminAuthGuard` decides.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    RolesController,
    AuditController,
    AppUsersController,
    DashboardController,
    SettingsAdminController,
  ],
  providers: [
    AuditService,
    AuditQueryService,
    AdminSessionService,
    AdminAuthService,
    AdminPermissionsService,
    RbacSyncService,
    RolesService,
    AdminUsersService,
    AdminMailer,
    AppUsersService,
    DashboardService,
    SettingsAdminService,
    { provide: APP_GUARD, useClass: AdminAuthGuard },
  ],
  exports: [
    AuditService,
    AdminPermissionsService,
    AdminSessionService,
    AdminMailer,
    AppUsersService,
  ],
})
export class AdminModule {}
