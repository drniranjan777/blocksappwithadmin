import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

/// What a person sees in a LIVE build for the parts of Creator Studio and the Payout Center that
/// the server does not offer yet. There they are `Unavailable*` repositories, which fail every
/// call with `NOT_AVAILABLE`.
///
/// Regression: Riverpod used to retry that permanent failure ten times with growing delays and show
/// "loading" throughout, so each tab spun for about 38 seconds and then blamed the connection.
/// The message must be there within a fraction of a second, and say the truth.
final List<Override> _live = [
  creatorRepositoryProvider.overrideWithValue(
    const UnavailableCreatorRepository(),
  ),
  creatorInsightsRepositoryProvider.overrideWithValue(
    const UnavailableCreatorInsightsRepository(),
  ),
  creatorMusicRepositoryProvider.overrideWithValue(
    const UnavailableCreatorMusicRepository(),
  ),
  creatorConfigRepositoryProvider.overrideWithValue(
    const UnavailableCreatorConfigRepository(),
  ),
  kycRepositoryProvider.overrideWithValue(const UnavailableKycRepository()),
  bankAccountRepositoryProvider.overrideWithValue(
    const UnavailableBankAccountRepository(),
  ),
  payoutRepositoryProvider.overrideWithValue(
    const UnavailablePayoutRepository(),
  ),
  taxRepositoryProvider.overrideWithValue(const UnavailableTaxRepository()),
  stepUpRepositoryProvider.overrideWithValue(
    const UnavailableStepUpRepository(),
  ),
];

void main() {
  const routes = {
    'Creator Studio overview': Routes.creatorStudio,
    'New reel': Routes.createReel,
    'Analytics': Routes.creatorAnalytics,
    'Reach': Routes.creatorReach,
    'Earnings': Routes.creatorEarnings,
    'Music and copyright': Routes.creatorMusic,
    'Payout Center': Routes.payoutCenter,
    'Payout verification': Routes.payoutVerification,
    'Payout methods': Routes.payoutBank,
    'Payout history': Routes.payoutHistory,
  };

  for (final entry in routes.entries) {
    testWidgets('${entry.key} says it is not available, at once', (
      tester,
    ) async {
      await openSignedInApp(
        tester,
        size: const Size(390, 1200),
        overrides: _live,
      );
      // `pumpAndSettle` would fast-forward any retry timers and hide a slow screen, so the
      // clock is moved by hand: half a second is the most a person should wait for this.
      // ignore: unawaited_futures
      containerOf(tester).read(routerProvider).push(entry.value);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(
        find.text('Not available yet'),
        findsWidgets,
        reason: '${entry.key} did not settle on the "not available" message',
      );
      expect(find.byType(CircularProgressIndicator), findsNothing);
      // Nothing to retry: the failure is permanent, and the old wording blamed the connection.
      expect(find.text('Try again'), findsNothing);
      expect(find.textContaining('check your connection'), findsNothing);
    });
  }
}
