import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/creator_demo_service.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/app_driver.dart';
import '../helpers/money_driver.dart';

/// The same guidelines as the main sweep, but on the screens that only exist
/// once the creator has done something: a reel on the timeline, an open sheet,
/// a half-filled form, a finished or failed publish.
Future<void> _meetsGuidelines(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

void a11yTest(
  String name,
  Future<void> Function(WidgetTester, MoneyDriver) body,
) {
  testWidgets(name, (tester) async {
    final handle = tester.ensureSemantics();
    final d = MoneyDriver(tester);
    try {
      await d.boot();
      await body(tester, d);
    } finally {
      handle.dispose();
    }
  });
}

Future<void> openEditorWithMedia(WidgetTester tester) async {
  await pushRoute(tester, Routes.createReel);
  final c = containerOf(tester);
  final lib = await c.read(mediaLibraryRepositoryProvider).getLibrary();
  c.read(reelStudioProvider.notifier).addMedia([
    lib.firstWhere((m) => m.id == 'g~clip~3101'),
    lib.firstWhere((m) => m.isPhoto),
    lib.firstWhere((m) => m.id == 'g~clip~3303'),
  ]);
  await tester.pumpAndSettle();
}

void main() {
  group('Reel editor with a reel on the timeline', () {
    for (final tool in StudioTool.values) {
      a11yTest('tool: ${tool.name}', (tester, d) async {
        await openEditorWithMedia(tester);
        containerOf(tester).read(reelStudioProvider.notifier).selectTool(tool);
        await tester.pumpAndSettle();
        await _meetsGuidelines(tester);
      });
    }

    a11yTest('with a caption layer and a sticker selected', (tester, d) async {
      await openEditorWithMedia(tester);
      final n = containerOf(tester).read(reelStudioProvider.notifier);
      n.selectClip(
        containerOf(tester).read(reelStudioProvider).draft.clips.first.id,
      );
      n.addText('Hello Hyderabad');
      n.selectTool(StudioTool.text);
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);

      n
        ..addSticker('🔥')
        ..selectTool(StudioTool.stickers);
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('the media picker', (tester, d) async {
      await pushRoute(tester, Routes.createReel);
      await tester.tap(find.bySemanticsLabel('Add media').first);
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('the music picker and the clip chooser', (tester, d) async {
      await openEditorWithMedia(tester);
      await pushRoute(tester, Routes.reelMusic);
      await _meetsGuidelines(tester);
      await tester.tap(find.textContaining('Charminar Nights').first);
      await tester.pumpAndSettle();
      expect(find.text('Choose the part to use'), findsOneWidget);
      await _meetsGuidelines(tester);
    });

    a11yTest('details, with a reel', (tester, d) async {
      await openEditorWithMedia(tester);
      await pushRoute(tester, Routes.reelDetails);
      await _meetsGuidelines(tester);
    });

    a11yTest('publishing: finished', (tester, d) async {
      await openEditorWithMedia(tester);
      await pushRoute(tester, Routes.reelPublishing);
      await tester.pumpAndSettle();
      expect(find.text('Reel Published ✓'), findsOneWidget);
      await _meetsGuidelines(tester);
    });

    a11yTest('publishing: failed, with Retry', (tester, d) async {
      await openEditorWithMedia(tester);
      containerOf(tester).read(mockWorldProvider).creator.publishOutcome =
          DemoPublishOutcome.uploadFails;
      await pushRoute(tester, Routes.reelPublishing);
      await tester.pumpAndSettle();
      expect(find.text('Retry'), findsOneWidget);
      await _meetsGuidelines(tester);
    });

    a11yTest('publishing: rejected by moderation', (tester, d) async {
      await openEditorWithMedia(tester);
      containerOf(tester).read(mockWorldProvider).creator.publishOutcome =
          DemoPublishOutcome.moderationRejects;
      await pushRoute(tester, Routes.reelPublishing);
      await tester.pumpAndSettle();
      expect(find.text('Upload failed'), findsOneWidget);
      await _meetsGuidelines(tester);
    });

    a11yTest('Drafts with a saved draft', (tester, d) async {
      await openEditorWithMedia(tester);
      await containerOf(tester).read(reelStudioProvider.notifier).saveDraft();
      await pushRoute(tester, Routes.creatorDrafts);
      await _meetsGuidelines(tester);
    });
  });

  group('Copyright and music', () {
    a11yTest('tracks with every status, and original audio', (tester, d) async {
      await pushRoute(tester, Routes.creatorMusic);
      await tester.pumpAndSettle();
      expect(find.text('Licence ends soon'), findsOneWidget);
      expect(find.text('Not available for new reels'), findsOneWidget);
      await _meetsGuidelines(tester);
    });
  });

  group('Money steps', () {
    a11yTest('identity: choose, details, documents, review', (tester, d) async {
      await pushRoute(tester, Routes.kycFlow);
      await _meetsGuidelines(tester);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
      // Going on without a date of birth shows the error; it must be readable.
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Choose your date of birth.'), findsOneWidget);
      await _meetsGuidelines(tester);
      // (The date picker itself is Flutter's own dialog, so it is not swept.)
      await tester.tap(find.text('Date of birth'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('PAN card'));
      await tester.pumpAndSettle();
      await tester.enterText(d.fieldLabeled('PAN number'), 'ABCDE1234F');
      await _meetsGuidelines(tester);
      await tester.tap(find.text('Choose'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
      await tester.tap(find.text('Take a photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Next'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('identity: a business is asked for its type', (tester, d) async {
      await pushRoute(tester, Routes.kycFlow);
      await tester.tap(find.text('Business'));
      await tester.pump();
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
      await tester.enterText(
        d.fieldLabeled('Business name'),
        'Hyderabad Foods',
      );
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Choose the type of business.'), findsOneWidget);
      await _meetsGuidelines(tester);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('identity: the review result', (tester, d) async {
      await d.verifyIdentity();
      await pushRoute(tester, Routes.kycFlow);
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('add bank: the form and the confirmation sheet', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      await pushRoute(tester, Routes.addBank);
      await tester.enterText(d.fieldLabeled('Account number'), '123456784821');
      await tester.enterText(
        d.fieldLabeled('Confirm account number'),
        '123456784821',
      );
      await tester.enterText(d.fieldLabeled('IFSC code'), 'HDFC0001234');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
      await tester.ensureVisible(find.text('Save and verify'));
      await tester.tap(find.text('Save and verify'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('bank accounts and a verified payout center', (tester, d) async {
      await d.verifyIdentity();
      await d.addBank();
      await pushRoute(tester, Routes.payoutBank);
      await _meetsGuidelines(tester);
      await pushRoute(tester, Routes.payoutCenter);
      await _meetsGuidelines(tester);
    });

    a11yTest('request a payout: form and confirmation', (tester, d) async {
      await d.verifyIdentity();
      await d.addBank();
      await pushRoute(tester, Routes.requestPayout);
      await tester.enterText(find.byType(TextField).first, '5000');
      // The first frame builds the enabled button, the second lets it finish
      // fading from its disabled colours; sample only after that.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await _meetsGuidelines(tester);
      await tester.ensureVisible(find.text('Review payout'));
      await tester.tap(find.text('Review payout'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });

    a11yTest('payout history with every status', (tester, d) async {
      await d.verifyIdentity();
      final bank = await d.addBank();
      final repo = containerOf(tester).read(payoutRepositoryProvider);
      await repo.requestPayout(amount: 1000, accountId: bank.id);
      await pushRoute(tester, Routes.payoutHistory);
      await _meetsGuidelines(tester);
      expect(PayoutStatus.values, hasLength(6));
    });

    a11yTest('tax information with a statement and a certificate', (
      tester,
      d,
    ) async {
      await d.verifyIdentity();
      final bank = await d.addBank();
      await containerOf(tester)
          .read(payoutRepositoryProvider)
          .requestPayout(amount: 1000, accountId: bank.id);
      await d.advance(const Duration(seconds: 15));
      await pushRoute(tester, Routes.payoutTax);
      await tester.pumpAndSettle();
      expect(find.text('Payout statement'), findsWidgets);
      expect(find.text('Tax withholding certificate'), findsOneWidget);
      await _meetsGuidelines(tester);
    });

    a11yTest('tax information, editing', (tester, d) async {
      await pushRoute(tester, Routes.payoutTax);
      await tester.tap(find.text('Add PAN'));
      await tester.pumpAndSettle();
      await _meetsGuidelines(tester);
    });
  });
}
