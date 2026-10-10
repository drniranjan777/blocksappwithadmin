import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/creator_music_screen.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/money_driver.dart';

/// Creator Studio → Copyright and music: what the creator has used, whether it
/// can still be used, and who may reuse their own audio.
void main() {
  Future<MoneyDriver> open(WidgetTester tester) async {
    final d = MoneyDriver(tester);
    await d.boot();
    await pushRoute(tester, Routes.creatorMusic);
    await tester.pumpAndSettle();
    expect(find.byType(CreatorMusicScreen), findsOneWidget);
    return d;
  }

  testWidgets('lists the tracks used, each with where it stands', (
    tester,
  ) async {
    await open(tester);

    for (final title in [
      'Charminar Nights',
      'Monsoon Mixtape',
      'Diwali Diyas',
      'Expired Licence Demo',
    ]) {
      expect(find.text(title), findsOneWidget, reason: title);
    }
    // Usable, usable but ending, and no longer usable.
    expect(find.text('Licence ends soon'), findsOneWidget);
    expect(find.textContaining('Licence until'), findsOneWidget);
    expect(find.text('Not available for new reels'), findsOneWidget);
    expect(find.text('The licence for this track has ended.'), findsOneWidget);
    expect(find.text('Available'), findsNWidgets(2));
    // The kind of rights holder is shown for tracks that are fine.
    expect(find.text('BLOCKS Library'), findsOneWidget);
    expect(find.text('Licensed'), findsOneWidget);
    // How many of their reels use a track.
    expect(find.text('Reels using it: 6'), findsOneWidget);
  });

  testWidgets('what needs attention is listed before what is fine', (
    tester,
  ) async {
    await open(tester);
    double top(String title) => tester.getTopLeft(find.text(title)).dy;
    expect(top('Expired Licence Demo'), lessThan(top('Diwali Diyas')));
    expect(top('Diwali Diyas'), lessThan(top('Charminar Nights')));
  });

  testWidgets('says plainly that rights are checked again and this is not '
      'legal advice', (tester) async {
    await open(tester);
    // It is the last thing on the page, so the lazy list builds it on demand.
    await tester.scrollUntilVisible(
      find.textContaining('checks rights again before every publish').first,
      300,
      // The section chips scroll sideways too; this is the page's list.
      scrollable: find.descendant(
        of: find.byType(ListView),
        matching: find.byType(Scrollable),
      ),
    );
    expect(
      find.textContaining('checks rights again before every publish'),
      findsOneWidget,
    );
    expect(find.textContaining('not legal advice'), findsOneWidget);
  });

  testWidgets('original audio: reuse is a switch the creator controls', (
    tester,
  ) async {
    await open(tester);
    final creator = containerOf(tester).read(mockWorldProvider).creator;
    expect(find.text('Charminar morning walk'), findsOneWidget);
    expect(find.text('Biryani point sizzle'), findsOneWidget);

    final switches = find.byType(Switch);
    expect(switches, findsNWidgets(2));
    expect(tester.widget<Switch>(switches.at(0)).value, isTrue);
    expect(tester.widget<Switch>(switches.at(1)).value, isFalse);

    await tester.ensureVisible(switches.at(1));
    await tester.pumpAndSettle();
    await tester.tap(switches.at(1));
    await tester.pumpAndSettle();

    // The server now has it, the switch follows, and the creator is told.
    expect(creator.reusableAudio, contains('oa2'));
    expect(tester.widget<Switch>(find.byType(Switch).at(1)).value, isTrue);
    expect(find.text('Others can now reuse this audio'), findsOneWidget);

    await tester.tap(find.byType(Switch).at(0));
    await tester.pumpAndSettle();
    expect(creator.reusableAudio, isNot(contains('oa1')));
    expect(tester.widget<Switch>(find.byType(Switch).at(0)).value, isFalse);
  });

  testWidgets('every switch says which audio it is for', (tester) async {
    final handle = tester.ensureSemantics();
    try {
      await open(tester);
      // The row's own text names the switch.
      final tile = tester.getSemantics(
        find.widgetWithText(SwitchListTile, 'Charminar morning walk'),
      );
      expect(tile.label, contains('Charminar morning walk'));
      expect(tile.label, contains('Others can reuse this audio'));
    } finally {
      handle.dispose();
    }
  });

  testWidgets('it is one of the Creator Studio sections', (tester) async {
    final d = MoneyDriver(tester);
    await d.boot();
    await pushRoute(tester, Routes.creatorStudio);
    await tester.pumpAndSettle();

    final chip = find.widgetWithText(PanelChip, 'Copyright & music');
    await tester.ensureVisible(chip);
    await tester.pumpAndSettle();
    await tester.tap(chip);
    await tester.pumpAndSettle();

    expect(find.byType(CreatorMusicScreen), findsOneWidget);
    // On this screen its own chip is the selected one.
    expect(
      tester
          .widget<PanelChip>(
            find.widgetWithText(PanelChip, 'Copyright & music'),
          )
          .selected,
      isTrue,
    );
  });
}
