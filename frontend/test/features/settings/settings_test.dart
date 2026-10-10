import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/features/auth/presentation/auth_entry_screen.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/features/settings/presentation/info_page_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/app_driver.dart';

void _tall(WidgetTester tester) {
  tester.view
    ..physicalSize = const Size(780, 3200)
    ..devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void main() {
  group('AppSettings persistence', () {
    ProviderContainer container(InMemoryLocalStore store) {
      final c = ProviderContainer(
        overrides: [localStoreProvider.overrideWithValue(store)],
      );
      addTearDown(c.dispose);
      return c;
    }

    test('defaults when nothing is stored', () {
      final s = container(InMemoryLocalStore()).read(appSettingsProvider);
      expect(s.themeMode, ThemeMode.system);
      expect(s.languageCode, isNull);
      expect(s.locale, isNull);
      expect(s.isOn(AppFlag.notifLikes), isTrue);
      expect(s.isOn(AppFlag.dataSaver), isFalse);
    });

    test('changes are saved and restored by a fresh controller', () async {
      final store = InMemoryLocalStore();
      final a = container(store);
      final n = a.read(appSettingsProvider.notifier);
      await n.setThemeMode(ThemeMode.dark);
      await n.setLanguage('te');
      await n.setFlag(AppFlag.dataSaver, value: true);
      await n.setFlag(AppFlag.notifLikes, value: false);
      await n.setSensitive(SensitiveContentLevel.less);
      await n.setWhoCanComment(InteractionScope.followers);
      await n.setWhoCanMessage(InteractionScope.nobody);

      final restored = container(store).read(appSettingsProvider);
      expect(restored.themeMode, ThemeMode.dark);
      expect(restored.languageCode, 'te');
      expect(restored.locale, const Locale('te'));
      expect(restored.isOn(AppFlag.dataSaver), isTrue);
      expect(restored.isOn(AppFlag.notifLikes), isFalse);
      expect(restored.isOn(AppFlag.notifComments), isTrue); // untouched default
      expect(restored.sensitive, SensitiveContentLevel.less);
      expect(restored.whoCanComment, InteractionScope.followers);
      expect(restored.whoCanMessage, InteractionScope.nobody);
    });

    test('language can be cleared back to the device default', () async {
      final store = InMemoryLocalStore();
      final n = container(store).read(appSettingsProvider.notifier);
      await n.setLanguage('hi');
      await n.setLanguage(null);
      expect(store.getString(StorageKeys.languageCode), isNull);
    });

    test('corrupt stored values fall back to defaults', () {
      final s = container(
        InMemoryLocalStore({
          StorageKeys.themeMode: 'neon',
          StorageKeys.sensitiveContent: '???',
        }),
      ).read(appSettingsProvider);
      expect(s.themeMode, ThemeMode.system);
      expect(s.sensitive, SensitiveContentLevel.standard);
    });
  });

  group('Settings screens', () {
    testWidgets('lists every settings area and the demo-mode note', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, Routes.settings);

      for (final t in [
        // Account
        'ACCOUNT',
        'Edit Profile',
        'Email',
        'Phone',
        'Password',
        'Account details',
        // Security
        'SECURITY',
        'Security overview',
        'Change Password',
        'Two-Factor Authentication',
        'Login Activity',
        'Logged-in Devices',
        'Security Notifications',
        // Privacy & safety
        'PRIVACY & SAFETY',
        'Privacy',
        // Preferences
        'Appearance',
        'Language',
        'Notifications',
        'Content preferences',
        'Blocked accounts',
        'Muted accounts',
        'Creator settings',
        'Business settings',
        'Help & support',
        'Community guidelines',
        'Privacy policy',
        'Terms of service',
        'Log out',
      ]) {
        expect(find.text(t), findsWidgets, reason: t);
      }
      expect(
        find.text('Demo mode · all data is generated on this device'),
        findsOneWidget,
      );
    });

    testWidgets('theme switch applies immediately and is stored', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, Routes.settings);

      await tester.tap(find.text('Dark'));
      await tester.pumpAndSettle();
      final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
      expect(app.themeMode, ThemeMode.dark);
      expect(
        containerOf(tester)
            .read(localStoreProvider)
            .getString(StorageKeys.themeMode),
        'dark',
      );
    });

    testWidgets('switching language to Hindi re-renders the app in Hindi', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, '/settings/language');
      expect(find.text('Language'), findsOneWidget);

      await tester.tap(find.text('हिन्दी'));
      await tester.pumpAndSettle();
      expect(find.text('भाषा'), findsOneWidget); // title now in Hindi
      expect(
        containerOf(tester)
            .read(localStoreProvider)
            .getString(StorageKeys.languageCode),
        'hi',
      );

      await tester.tap(find.text('తెలుగు'));
      await tester.pumpAndSettle();
      expect(find.text('భాష'), findsOneWidget);
    });

    testWidgets('notification preferences toggle; safety alerts stay on', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, '/settings/notifications');

      SwitchListTile tile(String title) => tester.widget<SwitchListTile>(
        find.widgetWithText(SwitchListTile, title),
      );

      expect(tile('Likes').value, isTrue);
      await tester.tap(find.widgetWithText(SwitchListTile, 'Likes'));
      await tester.pumpAndSettle();
      expect(tile('Likes').value, isFalse);
      expect(
        containerOf(tester).read(flagProvider(AppFlag.notifLikes)),
        isFalse,
      );

      expect(tile('Safety and security').onChanged, isNull);
      expect(tile('Safety and security').value, isTrue);
    });

    testWidgets('account details show the demo user', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, '/settings/account');
      expect(find.text('Aarav Kumar'), findsOneWidget);
      expect(find.text('@aarav.blocks'), findsOneWidget);
      expect(find.text('Hyderabad, Telangana'), findsOneWidget);
      expect(find.text('412 days'), findsOneWidget);
    });

    testWidgets('unknown settings page redirects to Settings', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, '/settings/nonsense');
      expect(currentLocation(tester), Routes.settings);
      expect(find.text('ACCOUNT'), findsOneWidget);
    });

    testWidgets('sections follow the specified order', (tester) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, Routes.settings);

      double top(String t) => tester.getTopLeft(find.text(t).first).dy;
      final order = [
        'ACCOUNT',
        'SECURITY',
        'PRIVACY & SAFETY',
        'PREFERENCES',
        'SUPPORT',
        'Log out',
      ];
      for (var i = 1; i < order.length; i++) {
        expect(
          top(order[i]),
          greaterThan(top(order[i - 1])),
          reason: '${order[i]} should come after ${order[i - 1]}',
        );
      }
    });

    testWidgets('log out confirms, then returns to the sign-in screen', (
      tester,
    ) async {
      _tall(tester);
      await openSignedInApp(tester, size: const Size(390, 3200));
      await pushRoute(tester, Routes.settings);

      await tester.ensureVisible(find.text('Log out').first);
      await tester.tap(find.text('Log out').first);
      await tester.pumpAndSettle();
      expect(find.text('Log out of BLOCKS?'), findsOneWidget);

      // Cancel keeps the session.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.byType(AuthEntryScreen), findsNothing);

      await tester.tap(find.text('Log out').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Log out').last);
      await tester.pumpAndSettle();
      expect(find.byType(AuthEntryScreen), findsOneWidget);
      // Onboarding is not repeated after logging out.
      expect(find.text('Continue as Demo User'), findsOneWidget);
    });
  });

  group('Info page parsing', () {
    test('splits headings from bodies and tolerates plain paragraphs', () {
      final s = parseInfoSections(
        '# One\nBody one.\n\nPlain intro.\n\n# Two\nBody two.',
      );
      expect(s, hasLength(3));
      expect(s[0].heading, 'One');
      expect(s[0].body, 'Body one.');
      expect(s[1].heading, isNull);
      expect(s[1].body, 'Plain intro.');
      expect(s[2].heading, 'Two');
    });

    test('empty input yields no sections', () {
      expect(parseInfoSections(''), isEmpty);
      expect(parseInfoSections('\n\n\n\n'), isEmpty);
    });
  });

  group('Info pages', () {
    testWidgets('guidelines render headings and paragraphs', (tester) async {
      await openSignedInApp(tester);
      await pushRoute(tester, Routes.info('guidelines'));
      expect(find.text('Community guidelines'), findsOneWidget);
      expect(find.text('Be real'), findsOneWidget);
      expect(find.text('Be kind'), findsOneWidget);
      expect(find.textContaining('Fake engagement'), findsOneWidget);
    });

    testWidgets('each topic has content; unknown topic is empty', (
      tester,
    ) async {
      await openSignedInApp(tester);
      for (final (topic, heading) in [
        ('privacy', 'What we collect'),
        ('terms', 'Using BLOCKS'),
        ('help', 'How do Reach Levels work?'),
      ]) {
        await pushRoute(tester, Routes.info(topic));
        expect(find.text(heading), findsOneWidget, reason: topic);
      }
      await pushRoute(tester, Routes.info('nope'));
      expect(find.text('Nothing here yet'), findsOneWidget);
    });
  });
}
