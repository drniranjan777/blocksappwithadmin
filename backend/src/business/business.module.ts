import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { SocialModule } from '../social/social.module.js';
import { BusinessAdminController } from './business-admin.controller.js';
import { PagesAdminService } from './pages-admin.service.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';
import { VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

/** Business pages and the verification badges. Advertising is in `AdsModule`. */
@Module({
  imports: [AdminModule, SocialModule],
  controllers: [PagesController, VerificationController, BusinessAdminController],
  providers: [PagesService, PagesAdminService, VerificationService],
  exports: [PagesService],
})
export class BusinessModule {}
