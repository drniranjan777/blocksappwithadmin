import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { IdempotencyService } from './idempotency/idempotency.service.js';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor.js';
import { SystemSettingsService } from './settings/system-settings.service.js';

/**
 * Cross-cutting behaviour applied to every route (one error shape, one success
 * shape) and the small services any feature may use.
 */
@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    IdempotencyService,
    SystemSettingsService,
  ],
  exports: [IdempotencyService, SystemSettingsService],
})
export class CommonModule {}
