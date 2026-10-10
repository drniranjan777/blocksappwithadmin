import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoute, AnyAdmin, CurrentAdmin } from '../../common/decorators/route-metadata.js';
import type { AdminAuthContext } from '../../common/http/request.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('admin-dashboard')
@ApiBearerAuth('admin')
@AdminRoute()
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // No single permission gates this page; each section inside is included only if the caller's roles
  // allow it (see DashboardService), so any signed-in staff member gets exactly what they may see.
  @AnyAdmin()
  @Get()
  @ApiOperation({
    summary: 'The front page numbers, counted from the real data',
    description:
      'Sections appear only if your roles can read them: users, content, reach, money (ledger), and the queues waiting for a person (identity, bank accounts, payouts, media, licences, reports).',
  })
  overview(@CurrentAdmin() a: AdminAuthContext) {
    return this.dashboard.overview(a);
  }
}
