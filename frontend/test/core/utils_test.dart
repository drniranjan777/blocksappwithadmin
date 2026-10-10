import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/utils/time_ago.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/l10n/gen/app_localizations_en.dart';
import 'package:blocks_app/l10n/gen/app_localizations_hi.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Debouncer', () {
    test('fires once, after the quiet period, with the last call', () {
      fakeAsync((async) {
        final d = Debouncer(delay: const Duration(milliseconds: 300));
        final calls = <int>[];
        d.run(() => calls.add(1));
        async.elapse(const Duration(milliseconds: 200));
        d.run(() => calls.add(2));
        async.elapse(const Duration(milliseconds: 200));
        expect(calls, isEmpty); // still inside the quiet period

        async.elapse(const Duration(milliseconds: 150));
        expect(calls, [2]);
        d.dispose();
      });
    });

    test('dispose cancels a pending call', () {
      fakeAsync((async) {
        final d = Debouncer();
        var fired = false;
        d.run(() => fired = true);
        d.dispose();
        async.elapse(const Duration(seconds: 2));
        expect(fired, isFalse);
      });
    });
  });

  group('timeAgo', () {
    final now = DateTime(2026, 10, 8, 12);
    final en = AppLocalizationsEn();

    test('buckets from "now" to weeks', () {
      String t(Duration ago) => timeAgo(en, now.subtract(ago), now: now);
      expect(t(const Duration(seconds: 20)), 'now');
      expect(t(const Duration(minutes: 5)), '5m');
      expect(t(const Duration(hours: 3)), '3h');
      expect(t(const Duration(days: 2)), '2d');
      expect(t(const Duration(days: 15)), '2w');
    });

    test('is localised', () {
      expect(
        timeAgo(
          AppLocalizationsHi(),
          now.subtract(const Duration(hours: 3)),
          now: now,
        ),
        '3 घं.',
      );
    });
  });

  group('demoSeedOf', () {
    test('parses demo urls and ignores network urls', () {
      expect(demoSeedOf('demo://art/123'), 123);
      expect(demoSeedOf('demo://reel/45'), 45);
      expect(demoSeedOf('https://cdn.example/x.jpg'), isNull);
    });
  });
}
