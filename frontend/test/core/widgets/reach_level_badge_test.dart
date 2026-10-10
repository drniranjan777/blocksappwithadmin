import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('shows code and localised name', (tester) async {
    await tester.pumpWidget(
      themed(const ReachLevelBadge(level: ReachLevel.state)),
    );
    expect(find.text('S1 · State'), findsOneWidget);
  });

  testWidgets('compact variant shows code only', (tester) async {
    await tester.pumpWidget(
      themed(const ReachLevelBadge(level: ReachLevel.global, showName: false)),
    );
    expect(find.text('G1'), findsOneWidget);
  });

  testWidgets('is localised (Hindi)', (tester) async {
    await tester.pumpWidget(
      themed(
        const ReachLevelBadge(level: ReachLevel.district),
        locale: const Locale('hi'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('D1 · ज़िला'), findsOneWidget);
  });

  testWidgets('exposes a screen-reader label', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      themed(const ReachLevelBadge(level: ReachLevel.national)),
    );
    expect(find.bySemanticsLabel('Reach level N1, National'), findsOneWidget);
    handle.dispose();
  });
}
