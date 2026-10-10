import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/api/api_creator_repository.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../data/api/fake_api.dart';
import '../../helpers/app_driver.dart';

/// Creator Studio in a live build, with the app's real creator repositories reading what the
/// server sends. Payouts, KYC and analytics are not on the server yet, so they stay unavailable:
/// the studio must show the real numbers and say so for the rest, without breaking.
void main() {
  final rig = Rig((request) async {
    if (request.path.endsWith('/creator/dashboard')) {
      return Reply.ok({
        'data': {
          'followers': 321,
          'monetization': {'status': 'ELIGIBLE', 'eligible': true},
          'reach': {
            'qualifiedReach30d': 4200,
            'bestLevel': 'STATE',
            'itemsByLevel': {
              'district': 3,
              'state': 1,
              'national': 0,
              'global': 0,
            },
            'coverage': {
              'district': 1,
              'state': 0.25,
              'national': 0,
              'global': 0,
            },
            'bestItemQualifiedReach': 1500,
          },
        },
      });
    }
    if (request.path.endsWith('/earnings/summary')) {
      return Reply.ok({
        'data': {
          'currency': 'INR',
          'bestLevel': 'STATE',
          'estimated': {
            'amount': '1250.75',
            'cycle': {
              'label': 'October',
              'startsAt': '2026-10-01T00:00:00.000Z',
              'endsAt': '2026-11-01T00:00:00.000Z',
            },
            'qualifiedReach': 4200,
            'level': 'STATE',
          },
          'pending': '0.00',
          'finalized': '777.00',
          'available': '4321.99',
          'paidOut': '100.00',
          'metrics30d': {
            'qualifiedViews': 4200,
            'watchSeconds': 36000,
            'shares': 40,
            'saves': 90,
            'likes': 500,
            'comments': 60,
            'engagementRate': 0.1643,
            'bestItemQualifiedReach': 1500,
          },
        },
      });
    }
    if (request.path.endsWith('/earnings/history')) {
      return Reply.ok({
        'data': [
          {
            'id': 'e1',
            'cycle': {
              'label': 'October',
              'startsAt': '2026-10-01T00:00:00.000Z',
              'endsAt': '2026-11-01T00:00:00.000Z',
              'status': 'OPEN',
            },
            'status': 'ESTIMATED',
            'amount': '1250.75',
            'isEstimate': true,
            'qualifiedReach': 4200,
            'level': 'STATE',
          },
        ],
        'meta': {'nextCursor': null, 'hasMore': false},
      });
    }
    return Reply.error(404, 'NOT_FOUND');
  });

  final overrides = [
    creatorRepositoryProvider.overrideWithValue(ApiCreatorRepository(rig.api)),
    creatorInsightsRepositoryProvider.overrideWithValue(
      ApiCreatorInsightsRepository(
        rig.api,
        now: () => DateTime.utc(2026, 10, 10, 12),
      ),
    ),
    // Not on the server yet: these stay "not available".
    kycRepositoryProvider.overrideWithValue(const UnavailableKycRepository()),
    bankAccountRepositoryProvider.overrideWithValue(
      const UnavailableBankAccountRepository(),
    ),
    payoutRepositoryProvider.overrideWithValue(
      const UnavailablePayoutRepository(),
    ),
    taxRepositoryProvider.overrideWithValue(const UnavailableTaxRepository()),
    creatorConfigRepositoryProvider.overrideWithValue(
      const UnavailableCreatorConfigRepository(),
    ),
    reelDraftRepositoryProvider.overrideWithValue(
      const UnavailableReelDraftRepository(),
    ),
  ];

  Future<void> open(WidgetTester tester, String route) async {
    await openSignedInApp(
      tester,
      size: const Size(390, 1800),
      overrides: overrides,
    );
    // ignore: unawaited_futures
    containerOf(tester).read(routerProvider).push(route);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('the studio shows the creator\'s real earnings', (tester) async {
    await open(tester, Routes.creatorStudio);

    expect(find.byType(ErrorView), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    // Whole rupees from the server's "1250.75": never rounded up.
    expect(find.textContaining('1,250'), findsWidgets);
    expect(find.textContaining('4,321'), findsWidgets);
  });

  testWidgets('the earnings tab shows the server\'s figures', (tester) async {
    await open(tester, Routes.creatorEarnings);

    expect(find.byType(ErrorView), findsNothing);
    expect(find.textContaining('4,321'), findsWidgets);
    expect(find.textContaining('1,250'), findsWidgets);
  });

  testWidgets('what is not on the server says so, beside what is', (
    tester,
  ) async {
    await open(tester, Routes.creatorAnalytics);
    expect(find.text('Not available yet'), findsWidgets);
    expect(find.text('Try again'), findsNothing);
  });
}
