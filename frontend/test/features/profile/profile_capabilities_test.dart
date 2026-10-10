import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void main() {
  testWidgets('the demo lets the username and the date of birth be edited', (
    tester,
  ) async {
    await openSignedInApp(tester);
    await pushRoute(tester, Routes.editProfile);

    final username = tester.widget<TextField>(
      find.widgetWithText(TextField, 'Username'),
    );
    expect(username.enabled, isTrue);
    expect(
      find.text('Your username is chosen once and cannot be changed.'),
      findsNothing,
    );
    await tester.scrollUntilVisible(
      find.text('Date of birth'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Date of birth'), findsOneWidget);
  });

  testWidgets(
    'the live service fixes both: the username is read-only and says why, and there is no birth date to edit',
    (tester) async {
      await openSignedInApp(
        tester,
        overrides: [
          profileCapabilitiesProvider.overrideWithValue(
            const ProfileCapabilities(
              canChangeUsername: false,
              canEditDateOfBirth: false,
            ),
          ),
        ],
      );
      await pushRoute(tester, Routes.editProfile);

      final username = tester.widget<TextField>(
        find.widgetWithText(TextField, 'Username'),
      );
      expect(username.enabled, isFalse);
      expect(
        find.text('Your username is chosen once and cannot be changed.'),
        findsOneWidget,
      );

      // Scroll the whole form: the birth-date field never appears, but gender does.
      final scrollable = find.byType(Scrollable).first;
      for (var i = 0; i < 12; i++) {
        await tester.drag(scrollable, const Offset(0, -400));
        await tester.pump();
      }
      expect(find.text('Date of birth'), findsNothing);
      expect(find.text('Gender'), findsOneWidget);
    },
  );
}
