import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/money_driver.dart';

/// The demo lab steers the mock back-end so a walk-through can show the
/// unhappy paths. These tests check that each control really changes what the
/// "server" will do next, and that the screens then show it.
Future<void> bringIntoView(WidgetTester tester, Finder finder) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
    await tester.drag(scrollable, const Offset(0, -300));
    await tester.pump();
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Future<void> tapChip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(PanelChip, label);
  await bringIntoView(tester, chip);
  await tester.tap(chip.first);
  await tester.pumpAndSettle();
}

void main() {
  late MoneyDriver d;

  Future<void> openLab(WidgetTester tester) async {
    d = MoneyDriver(tester);
    await d.boot();
  }

  Future<void> showLab(WidgetTester tester) async {
    await pushRoute(tester, Routes.securityDemo);
    await bringIntoView(tester, find.text('Creator and payouts'));
  }

  testWidgets('shows what the server believes right now', (tester) async {
    await openLab(tester);
    await showLab(tester);

    expect(
      find.textContaining('Identity: Not started'),
      findsOneWidget,
      reason: 'a new creator has not started verification',
    );
    expect(find.textContaining('0 bank accounts'), findsOneWidget);
  });

  testWidgets('reflects a verified creator with a bank account', (
    tester,
  ) async {
    await openLab(tester);
    await d.verifyIdentity();
    await d.addBank();
    await showLab(tester);

    expect(find.textContaining('Identity: Verified'), findsOneWidget);
    expect(find.textContaining('1 bank accounts'), findsOneWidget);
  });

  testWidgets('each outcome chip sets what the next action will do', (
    tester,
  ) async {
    await openLab(tester);
    await showLab(tester);
    final creator = containerOf(tester).read(mockWorldProvider).creator;

    // Defaults: everything succeeds.
    expect(creator.kycOutcome, DemoKycOutcome.verified);
    expect(creator.payoutOutcome, DemoPayoutOutcome.completed);
    expect(creator.publishOutcome, DemoPublishOutcome.published);

    await tapChip(tester, 'Rejected');
    expect(creator.kycOutcome, DemoKycOutcome.rejected);
    await tapChip(tester, 'Action required');
    expect(creator.kycOutcome, DemoKycOutcome.actionRequired);

    await tapChip(tester, 'Failed');
    expect(creator.payoutOutcome, DemoPayoutOutcome.failed);
    await tapChip(tester, 'On hold');
    expect(creator.payoutOutcome, DemoPayoutOutcome.onHold);
    await tapChip(tester, 'Reversed');
    expect(creator.payoutOutcome, DemoPayoutOutcome.reversed);

    await tapChip(tester, 'Upload fails once');
    expect(creator.publishOutcome, DemoPublishOutcome.uploadFails);
    await tapChip(tester, 'Rejected by moderation');
    expect(creator.publishOutcome, DemoPublishOutcome.moderationRejects);
    await tapChip(tester, 'Goes live');
    expect(creator.publishOutcome, DemoPublishOutcome.published);
  });

  testWidgets('the selected chip follows the server state', (tester) async {
    await openLab(tester);
    await showLab(tester);

    bool selected(String label) => tester
        .widget<PanelChip>(find.widgetWithText(PanelChip, label).first)
        .selected;

    expect(selected('Verified'), isTrue);
    expect(selected('Rejected'), isFalse);
    await tapChip(tester, 'Rejected');
    expect(selected('Rejected'), isTrue);
    expect(selected('Verified'), isFalse);
  });

  testWidgets('the safety hold switch turns the post-bank-change hold on', (
    tester,
  ) async {
    await openLab(tester);
    await showLab(tester);
    final creator = containerOf(tester).read(mockWorldProvider).creator;
    expect(creator.payoutConfig.holdAfterAccountChange, Duration.zero);

    final toggle = find.widgetWithText(
      SwitchListTile,
      'Pause payouts for 24 h after a bank change',
    );
    await bringIntoView(tester, toggle);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(
      creator.payoutConfig.holdAfterAccountChange,
      const Duration(hours: 24),
    );

    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(creator.payoutConfig.holdAfterAccountChange, Duration.zero);
  });

  testWidgets('expiring verification shows on the status line', (tester) async {
    await openLab(tester);
    await d.verifyIdentity();
    await showLab(tester);
    expect(find.textContaining('Identity: Verified'), findsOneWidget);

    final expire = find.text('Expire identity verification');
    await bringIntoView(tester, expire);
    await tester.tap(expire);
    await tester.pumpAndSettle();

    final creator = containerOf(tester).read(mockWorldProvider).creator;
    expect(creator.kyc.status, KycStatus.expired);
    expect(find.textContaining('Identity: Expired'), findsOneWidget);
  });

  testWidgets('reset brings the creator back to a clean start', (tester) async {
    await openLab(tester);
    await d.verifyIdentity();
    await d.addBank();
    await showLab(tester);
    final creator = containerOf(tester).read(mockWorldProvider).creator;
    await tapChip(tester, 'Failed');
    await tapChip(tester, 'Upload fails once');
    expect(creator.banks, isNotEmpty);

    final reset = find.text('Reset creator and payout data');
    await bringIntoView(tester, reset);
    await tester.tap(reset);
    await tester.pumpAndSettle();

    expect(find.text('Creator and payout data reset'), findsOneWidget);
    expect(creator.banks, isEmpty);
    expect(creator.kyc.status, KycStatus.notStarted);
    expect(creator.payoutOutcome, DemoPayoutOutcome.completed);
    expect(creator.publishOutcome, DemoPublishOutcome.published);
    expect(find.textContaining('Identity: Not started'), findsOneWidget);
    expect(find.textContaining('0 bank accounts'), findsOneWidget);
  });

  testWidgets('"Open Creator Studio" goes to the hub', (tester) async {
    await openLab(tester);
    await showLab(tester);
    final open = find.text('Open Creator Studio');
    await bringIntoView(tester, open);
    await tester.tap(open);
    await tester.pumpAndSettle();
    expect(find.text('Creator Studio'), findsWidgets);
    expect(find.text('Creator and payouts'), findsNothing);
  });
}
