import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';

/** The append-only double-entry ledger: the only place money lives. */
@Module({ providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
