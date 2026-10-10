import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/rising_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/pump_app.dart';

const _calc = ReachCalculator(ReachConfig.demo());

void main() {
  group('ReachLadder', () {
    testWidgets('reached levels tick, next shows percent, rest locked', (
      tester,
    ) async {
      // 55,001 = State, 50% of the way to National.
      await tester.pumpWidget(
        themed(ReachLadder(progress: _calc.evaluate(55001))),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.check_rounded), findsNWidgets(2)); // D1, S1
      expect(find.text('50%'), findsOneWidget); // N1 in progress
      expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget); // G1
      expect(find.text('NATIONAL'), findsOneWidget);
    });

    testWidgets('top level shows the achievement mark and no locks', (
      tester,
    ) async {
      await tester.pumpWidget(
        themed(ReachLadder(progress: _calc.evaluate(2000000))),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.workspace_premium_rounded), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline_rounded), findsNothing);
    });

    testWidgets('screen readers get a full summary', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        themed(ReachLadder(progress: _calc.evaluate(55001))),
      );
      await tester.pumpAndSettle();

      expect(
        find.bySemanticsLabel(
          'Reach ladder. District reached, State reached, '
          'National 50 percent, Global locked',
        ),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('fits a very narrow screen without overflow', (tester) async {
      tester.view
        ..physicalSize = const Size(280, 600)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        themed(
          Padding(
            padding: const EdgeInsets.all(16),
            child: ReachLadder(progress: _calc.evaluate(55001)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('RisingBanner', () {
    testWidgets('own post: 82% toward State with remaining interactions', (
      tester,
    ) async {
      await tester.pumpWidget(
        themed(RisingBanner(progress: _calc.evaluate(8200), isOwnPost: true)),
      );
      await tester.pumpAndSettle();

      expect(find.text('RISING'), findsOneWidget);
      expect(find.text('Your post is 81% toward State level'), findsOneWidget);
      expect(find.text('Current: District'), findsOneWidget);
      expect(find.text('Next: State'), findsOneWidget);
      expect(
        find.text('1,801 more qualified interactions needed'),
        findsOneWidget,
      );
    });

    testWidgets("someone else's post uses neutral wording", (tester) async {
      await tester.pumpWidget(
        themed(RisingBanner(progress: _calc.evaluate(8200))),
      );
      await tester.pumpAndSettle();
      expect(find.text('This post is 81% toward State level'), findsOneWidget);
    });

    test('only shows once a post is at least halfway to the next level', () {
      expect(RisingBanner.shouldShow(_calc.evaluate(2000)), isFalse);
      expect(RisingBanner.shouldShow(_calc.evaluate(8200)), isTrue);
      expect(RisingBanner.shouldShow(_calc.evaluate(2000000)), isFalse);
    });
  });
}
