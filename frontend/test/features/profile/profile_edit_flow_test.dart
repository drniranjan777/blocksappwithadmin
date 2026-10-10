import 'dart:typed_data';

import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/services/local_media_store.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/services/security_demo_service.dart';
import 'package:blocks_app/features/profile/application/photo_upload_controller.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';
import '../../helpers/fake_photo_picker.dart';

Finder field(String label) => find.widgetWithText(TextField, label);

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 40 && finder.evaluate().isEmpty; i++) {
    await tester.drag(scrollable, const Offset(0, -300));
    await tester.pump();
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Future<FakePhotoPicker> openProfile(
  WidgetTester tester, {
  Iterable<Object?> script = const [],
}) async {
  final picker = FakePhotoPicker(script);
  await openSignedInApp(
    tester,
    overrides: [profilePhotoPickerProvider.overrideWithValue(picker)],
  );
  routerOf(tester).go(Routes.profile);
  await tester.pumpAndSettle();
  return picker;
}

Future<FakePhotoPicker> openEdit(
  WidgetTester tester, {
  Iterable<Object?> script = const [],
}) async {
  final picker = FakePhotoPicker(script);
  await openSignedInApp(
    tester,
    overrides: [profilePhotoPickerProvider.overrideWithValue(picker)],
  );
  await pushRoute(tester, Routes.editProfile);
  return picker;
}

Future<void> tapSave(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(TextButton, 'Save'));
  await tester.pumpAndSettle();
}

/// Types into a username field and lets the 400 ms availability check run.
Future<void> typeUsername(WidgetTester tester, String value) async {
  await tester.enterText(field('Username'), value);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

void main() {
  group('Profile menu and entry points', () {
    testWidgets(
      'the top-right menu leads with Edit Profile, Security, Settings',
      (tester) async {
        await openProfile(tester);
        await tester.tap(find.byTooltip('Menu'));
        await tester.pumpAndSettle();

        final titles = tester
            .widgetList<ListTile>(find.byType(ListTile))
            .map((t) => (t.title! as Text).data)
            .toList();
        expect(titles.take(3), ['Edit Profile', 'Security', 'Settings']);
        // Everything that was there before is still reachable.
        for (final t in ['Creator Studio', 'Messages', 'Safety Center']) {
          expect(titles, contains(t));
        }
      },
    );

    testWidgets('Edit Profile opens from the profile button', (tester) async {
      await openProfile(tester);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit Profile'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.editProfile);
    });

    testWidgets('and from the menu and from Settings', (tester) async {
      await openProfile(tester);
      await tester.tap(find.byTooltip('Menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit Profile').last);
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.editProfile);

      await pushRoute(tester, Routes.settings);
      await tester.tap(find.text('Edit Profile'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.editProfile);
    });

    testWidgets('Security opens from the menu', (tester) async {
      await openProfile(tester);
      await tester.tap(find.byTooltip('Menu'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Security'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.security);
    });
  });

  group('Settings structure', () {
    testWidgets('Account and Security groups hold the specified entries', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.settings);

      // Section headers render in capitals.
      expect(find.text('ACCOUNT'), findsOneWidget);
      for (final t in ['Edit Profile', 'Email', 'Phone', 'Password']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      await scrollTo(tester, find.text('Security overview'));
      expect(find.text('SECURITY'), findsOneWidget);
      for (final t in [
        'Change Password',
        'Two-Factor Authentication',
        'Login Activity',
        'Logged-in Devices',
        'Security Notifications',
      ]) {
        await scrollTo(tester, find.text(t));
        expect(find.text(t), findsOneWidget, reason: t);
      }
      for (final t in [
        'PRIVACY & SAFETY',
        'Content preferences',
        'Help & support',
        'Community guidelines',
        'Privacy policy',
        'Terms of service',
      ]) {
        await scrollTo(tester, find.textContaining(t.split(' ').first));
      }
    });

    testWidgets('Email, Phone and Password rows open their screens', (
      tester,
    ) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.settings);

      await tester.tap(find.text('Email'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.changeEmail);
      routerOf(tester).pop();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Phone'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.changePhone);
      routerOf(tester).pop();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Password'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.changePassword);
    });
  });

  group('Edit Profile form', () {
    testWidgets('is prefilled and Save is off until something changes', (
      tester,
    ) async {
      await openEdit(tester);

      expect(
        tester.widget<TextField>(field('Full name')).controller!.text,
        'Aarav Kumar',
      );
      expect(
        tester.widget<TextField>(field('Username')).controller!.text,
        'aarav.blocks',
      );
      expect(find.text('Public profile'), findsOneWidget);
      expect(find.text('Anyone on BLOCKS can see this.'), findsOneWidget);
      await scrollTo(tester, find.text('Private details'));
      expect(find.text('Only you can see this.'), findsOneWidget);
      expect(find.text('Male'), findsOneWidget);

      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Save'))
            .onPressed,
        isNull,
      );
    });

    testWidgets('editing the name saves and shows on the profile at once', (
      tester,
    ) async {
      await openProfile(tester);
      expect(find.text('Aarav Kumar'), findsWidgets);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit Profile'));
      await tester.pumpAndSettle();

      await tester.enterText(field('Full name'), 'Aarav K. Reddy');
      await tester.pump();
      await tapSave(tester);

      expect(find.text('Profile updated'), findsOneWidget);
      expect(currentLocation(tester), Routes.profile);
      expect(find.text('Aarav K. Reddy'), findsWidgets);
      expect(find.text('Aarav Kumar'), findsNothing);
    });

    testWidgets('bio shows a live counter and is limited to 150', (
      tester,
    ) async {
      await openEdit(tester);
      await tester.enterText(field('Bio'), 'Hello BLOCKS');
      await tester.pump();
      expect(find.text('12/150'), findsOneWidget);

      await tester.enterText(field('Bio'), 'x' * 151);
      await tester.pump();
      expect(find.text('Keep your bio under 150 characters.'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Save'))
            .onPressed,
        isNull,
      );
    });

    testWidgets('website must look like a web address, and is normalised', (
      tester,
    ) async {
      await openEdit(tester);
      await tester.enterText(field('Website'), 'not a site');
      await tester.pump();
      expect(
        find.text('Enter a valid website, for example example.com.'),
        findsOneWidget,
      );

      await tester.enterText(field('Website'), 'blocks.in/aarav');
      await tester.pump();
      expect(find.textContaining('valid website'), findsNothing);
      await tapSave(tester);

      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.website, 'https://blocks.in/aarav');
    });

    testWidgets('the saved website appears on the profile', (tester) async {
      await openProfile(tester);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Edit Profile'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Website'), 'blocks.in/aarav');
      await tester.pump();
      await tapSave(tester);
      expect(find.text('blocks.in/aarav'), findsOneWidget);
    });

    testWidgets('empty or too-short names are refused', (tester) async {
      await openEdit(tester);
      await tester.enterText(field('Full name'), '');
      await tester.pump();
      expect(find.text('This field is required'), findsOneWidget);
      await tester.enterText(field('Full name'), 'A');
      await tester.pump();
      expect(find.text('Enter at least 2 characters.'), findsOneWidget);
    });
  });

  group('username', () {
    testWidgets('an invalid format is explained straight away', (tester) async {
      await openEdit(tester);
      await typeUsername(tester, 'a');
      expect(find.text('Use at least 3 characters.'), findsOneWidget);
      await typeUsername(tester, '.bad');
      expect(
        find.textContaining('Use only letters, numbers, dots and underscores'),
        findsOneWidget,
      );
    });

    testWidgets('a taken name is reported after the availability check', (
      tester,
    ) async {
      await openEdit(tester);
      await tester.enterText(field('Username'), 'meera.eats');
      await tester.pump();
      expect(find.text('Checking availability...'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();

      expect(find.text('That username is already taken.'), findsOneWidget);
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Save'))
            .onPressed,
        isNull,
      );
    });

    testWidgets('a free name says so and can be saved', (tester) async {
      await openEdit(tester);
      await typeUsername(tester, 'aarav.new');
      expect(find.text('This username is available'), findsOneWidget);

      await tapSave(tester);
      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.username, '@aarav.new');
    });

    testWidgets('reserved names are refused', (tester) async {
      await openEdit(tester);
      await typeUsername(tester, 'support');
      expect(find.text("That username isn't available."), findsOneWidget);
    });

    testWidgets('going back to your own name needs no check', (tester) async {
      await openEdit(tester);
      await typeUsername(tester, 'aarav.new');
      await typeUsername(tester, 'aarav.blocks');
      expect(find.text('Checking availability...'), findsNothing);
      expect(find.text('This username is available'), findsNothing);
    });

    testWidgets('the server has the last word: saving a taken name before the '
        'check finishes is still refused', (tester) async {
      await openEdit(tester);
      await tester.enterText(field('Username'), 'meera.eats');
      await tester.pump(); // check not run yet
      await tapSave(tester);

      expect(find.text('That username is already taken.'), findsOneWidget);
      expect(currentLocation(tester), Routes.editProfile);
      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.username, '@aarav.blocks');
    });
  });

  group('location, date of birth, gender, language', () {
    testWidgets('state and district are pick-lists for India', (tester) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('Country'));
      expect(find.byType(DropdownButtonFormField<String>), findsNWidgets(3));
      expect(find.text('Telangana'), findsOneWidget);
      expect(find.text('Hyderabad'), findsWidgets);
    });

    testWidgets('changing the state moves the district to a valid one', (
      tester,
    ) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('Telangana'));
      await tester.tap(find.text('Telangana'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Maharashtra').last);
      await tester.pumpAndSettle();

      final me = containerOf(tester);
      await tapSave(tester);
      final user = await me.read(currentUserProvider.future);
      expect(user.state, 'Maharashtra');
      // A Maharashtra district, not Hyderabad.
      expect(['Pune', 'Mumbai'], contains(user.district));
    });

    testWidgets('outside India they become free text', (tester) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('India'));
      await tester.tap(find.text('India'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nepal').last);
      await tester.pumpAndSettle();

      await scrollTo(tester, field('State'));
      expect(field('State'), findsOneWidget);
      expect(field('District'), findsOneWidget);
      expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
    });

    testWidgets('date of birth opens a picker and gender is a choice', (
      tester,
    ) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('Date of birth'));
      await tester.tap(find.text('Date of birth'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await tester.tap(find.text('15'));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsNothing);

      await scrollTo(tester, find.text('Female'));
      await tester.tap(find.text('Female'));
      await tester.pumpAndSettle();
      await tapSave(tester);

      final p = await containerOf(tester)
          .read(profileRepositoryProvider)
          .getPrivateProfile();
      expect(p.dateOfBirth, DateTime(1996, 8, 15));
      expect(p.gender, Gender.female);
    });

    testWidgets('tapping the chosen gender again clears it', (tester) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('Male'));
      await tester.tap(find.text('Male'));
      await tester.pumpAndSettle();
      await tapSave(tester);
      final p = await containerOf(tester)
          .read(profileRepositoryProvider)
          .getPrivateProfile();
      expect(p.gender, isNull);
    });

    testWidgets('language switches the whole app immediately', (tester) async {
      await openEdit(tester);
      await scrollTo(tester, find.text('हिन्दी'));
      await tester.tap(find.text('हिन्दी'));
      await tester.pumpAndSettle();

      expect(containerOf(tester).read(appSettingsProvider).languageCode, 'hi');
      expect(find.text('प्रोफ़ाइल संपादित करें'), findsOneWidget);
    });
  });

  group('leaving with unsaved changes', () {
    testWidgets('asks first, and Keep editing stays', (tester) async {
      await openEdit(tester);
      await tester.enterText(field('Full name'), 'Someone Else');
      await tester.pump();

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Discard changes?'), findsOneWidget);
      expect(find.text('Your edits will be lost.'), findsOneWidget);

      await tester.tap(find.text('Keep editing'));
      await tester.pumpAndSettle();
      expect(currentLocation(tester), Routes.editProfile);
      expect(
        tester.widget<TextField>(field('Full name')).controller!.text,
        'Someone Else',
      );
    });

    testWidgets('Discard throws the edits away', (tester) async {
      await openEdit(tester);
      await tester.enterText(field('Full name'), 'Someone Else');
      await tester.pump();
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();

      expect(currentLocation(tester), isNot(Routes.editProfile));
      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.name, 'Aarav Kumar');
    });

    testWidgets('nothing changed: leaves without a question', (tester) async {
      await openEdit(tester);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Discard changes?'), findsNothing);
      expect(currentLocation(tester), isNot(Routes.editProfile));
    });
  });

  group('profile photo', () {
    testWidgets('tapping the picture offers the specified choices', (
      tester,
    ) async {
      await openProfile(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();

      expect(find.text('Change Profile Photo'), findsOneWidget);
      expect(find.text('Take Photo'), findsOneWidget);
      expect(find.text('Choose from Gallery'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      // There is no photo yet, so there is nothing to remove.
      expect(find.text('Remove Photo'), findsNothing);

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Change Profile Photo'), findsNothing);
    });

    testWidgets('Take Photo uploads and the new picture shows at once', (
      tester,
    ) async {
      final picker = await openProfile(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();

      expect(picker.requested, [PhotoSource.camera]);
      expect(find.text('Profile photo updated'), findsOneWidget);
      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(LocalMediaStore.isLocal(me.avatarUrl!), isTrue);
      expect(
        containerOf(tester).read(localMediaStoreProvider).get(me.avatarUrl!),
        isNotNull,
      );
    });

    testWidgets('Choose from Gallery uses the gallery', (tester) async {
      final picker = await openProfile(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();
      expect(picker.requested, [PhotoSource.gallery]);
      expect(find.text('Profile photo updated'), findsOneWidget);
    });

    testWidgets('Remove Photo appears once there is one, and asks first', (
      tester,
    ) async {
      await openProfile(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove Photo'));
      await tester.pumpAndSettle();
      expect(find.text('Remove your photo?'), findsOneWidget);

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      var me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.avatarUrl, isNotNull);

      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove Photo'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Remove Photo'));
      await tester.pumpAndSettle();

      expect(find.text('Profile photo removed'), findsOneWidget);
      me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.avatarUrl, isNull);
    });

    testWidgets('backing out of the picker changes nothing', (tester) async {
      await openProfile(tester, script: [null]);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();
      expect(find.text('Profile photo updated'), findsNothing);
      expect(
        containerOf(tester).read(photoUploadControllerProvider).phase,
        PhotoPhase.idle,
      );
    });

    testWidgets('a wrong file type is refused before any upload', (
      tester,
    ) async {
      await openProfile(
        tester,
        script: [
          PickedPhoto(
            bytes: kTinyPng,
            fileName: 'a.gif',
            mimeType: 'image/gif',
          ),
        ],
      );
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();

      expect(find.text('Use a JPG, PNG or WebP photo.'), findsOneWidget);
      expect(find.text('Try again'), findsNothing); // a retry cannot help
      final me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.avatarUrl, isNull);
    });

    testWidgets('a photo over 5 MB is refused', (tester) async {
      final big = Uint8List(PhotoRules.maxBytes + 1)..setAll(0, kTinyPng);
      await openProfile(
        tester,
        script: [
          PickedPhoto(bytes: big, fileName: 'big.png', mimeType: 'image/png'),
        ],
      );
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();

      expect(
        find.text('That photo is too large. Choose one under 5 MB.'),
        findsOneWidget,
      );
      expect(containerOf(tester).read(localMediaStoreProvider).length, 0);
    });

    testWidgets('a camera / gallery problem is reported', (tester) async {
      await openProfile(tester, script: [const PhotoPickFailure('denied')]);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();
      expect(
        find.text("Couldn't open your camera or gallery."),
        findsOneWidget,
      );
    });

    testWidgets('an interrupted upload shows an error, and Try again works', (
      tester,
    ) async {
      await openProfile(tester);
      // Demo scenario H: the next upload fails once.
      await containerOf(tester)
          .read(securityDemoServiceProvider)
          .run(DemoScenario.photoUploadFails);

      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();

      expect(
        find.text(
          "Couldn't upload the photo. Check your connection and try again.",
        ),
        findsOneWidget,
      );
      var me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.avatarUrl, isNull);

      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Profile photo updated'), findsOneWidget);
      me = await containerOf(tester).read(currentUserProvider.future);
      expect(me.avatarUrl, isNotNull);
    });

    testWidgets('status messages can be dismissed', (tester) async {
      await openProfile(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Take Photo'));
      await tester.pumpAndSettle();
      expect(find.text('Profile photo updated'), findsOneWidget);

      await tester.tap(find.byTooltip('Close'));
      await tester.pumpAndSettle();
      expect(find.text('Profile photo updated'), findsNothing);
    });

    testWidgets('the same flow works from Edit Profile', (tester) async {
      final picker = await openEdit(tester);
      await tester.tap(find.byIcon(Icons.photo_camera_rounded));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from Gallery'));
      await tester.pumpAndSettle();
      expect(picker.requested, [PhotoSource.gallery]);
      expect(find.text('Profile photo updated'), findsOneWidget);
    });
  });

  group('photo upload progress', () {
    test('goes idle -> uploading (rising) -> done', () async {
      // Plain container test with real (tiny) latency so progress is visible.
      final states = <PhotoUploadState>[];
      final c = _containerWithLatency(const Duration(milliseconds: 20));
      c.listen(photoUploadControllerProvider, (_, s) => states.add(s));

      await c
          .read(photoUploadControllerProvider.notifier)
          .choose(PhotoSource.gallery);

      final uploading = states.where((s) => s.isUploading).toList();
      expect(uploading.length, greaterThan(2));
      final progress = uploading.map((s) => s.progress).toList();
      for (var i = 1; i < progress.length; i++) {
        expect(progress[i], greaterThanOrEqualTo(progress[i - 1]));
      }
      expect(progress.last, lessThan(1));
      expect(states.last.phase, PhotoPhase.done);
    });
  });
}

ProviderContainer _containerWithLatency(Duration latency) {
  final c = ProviderContainer(
    overrides: [
      localStoreProvider.overrideWithValue(InMemoryLocalStore()),
      mockLatencyProvider.overrideWithValue(latency),
      profilePhotoPickerProvider.overrideWithValue(FakePhotoPicker()),
    ],
  );
  addTearDown(c.dispose);
  return c;
}
