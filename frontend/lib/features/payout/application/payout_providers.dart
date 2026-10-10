import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Balances, eligibility (decided by the server), rules and accounts.
final payoutOverviewProvider = FutureProvider.autoDispose<PayoutOverview>(
  (ref) => ref.watch(payoutRepositoryProvider).getOverview(),
);

final payoutHistoryProvider = FutureProvider.autoDispose<List<PayoutRequest>>(
  (ref) => ref.watch(payoutRepositoryProvider).getHistory(),
);

final bankAccountsProvider = FutureProvider.autoDispose<List<BankAccount>>(
  (ref) => ref.watch(bankAccountRepositoryProvider).getAccounts(),
);

final taxInfoProvider = FutureProvider.autoDispose<TaxInfo>(
  (ref) => ref.watch(taxRepositoryProvider).getTaxInfo(),
);

/// Server-controlled payout rules (minimum, timings, thresholds).
final payoutConfigProvider = FutureProvider<PayoutConfig>(
  (ref) => ref.watch(creatorConfigRepositoryProvider).getPayoutConfig(),
);

/// Re-reads everything the Payout Center shows, after an action changed it.
void refreshPayoutData(WidgetRef ref) {
  ref
    ..invalidate(payoutOverviewProvider)
    ..invalidate(payoutHistoryProvider)
    ..invalidate(bankAccountsProvider)
    ..invalidate(taxInfoProvider);
}
