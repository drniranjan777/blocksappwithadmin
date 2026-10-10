import 'package:blocks_app/data/models/creator_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// The Reach Ladder as applied to reels and to a creator's reach.
void main() {
  const calc = ReachCalculator(ReachConfig.demo());

  group('District, State, National, Global', () {
    test('boundaries follow the configured thresholds', () {
      ReachLevel at(int reach) => calc.evaluate(reach).current;
      expect(at(0), ReachLevel.district);
      expect(at(10000), ReachLevel.district);
      expect(at(10001), ReachLevel.state);
      expect(at(100000), ReachLevel.state);
      expect(at(100001), ReachLevel.national);
      expect(at(1000000), ReachLevel.national);
      expect(at(1000001), ReachLevel.global);
      expect(at(50000000), ReachLevel.global);
    });

    test(
      'a new reel starts in the District with the whole ladder to climb',
      () {
        final p = calc.evaluate(0);
        expect(p.current, ReachLevel.district);
        expect(p.next, ReachLevel.state);
        expect(p.remainingToNext, 10001);
        expect(p.fractionToNext, 0);
      },
    );

    test('progress to the next level and what is left', () {
      final p = calc.evaluate(5000);
      expect(p.next, ReachLevel.state);
      expect(p.remainingToNext, 5001);
      expect(p.percentToNext, inInclusiveRange(40, 55));
    });

    test('the top of the ladder has nothing further', () {
      final p = calc.evaluate(2000000);
      expect(p.current, ReachLevel.global);
      expect(p.next, isNull);
      expect(p.fractionToNext, 1);
      expect(p.remainingToNext, 0);
    });

    test(
      'different thresholds from the server change the result, no code change',
      () {
        const stricter = ReachCalculator(
          ReachConfig(
            unlockAt: {
              ReachLevel.district: 0,
              ReachLevel.state: 500,
              ReachLevel.national: 5000,
              ReachLevel.global: 50000,
            },
          ),
        );
        expect(stricter.evaluate(600).current, ReachLevel.state);
        expect(calc.evaluate(600).current, ReachLevel.district);
      },
    );

    test('negative reach is invalid', () {
      expect(() => calc.evaluate(-1), throwsArgumentError);
    });
  });

  group('creator numbers', () {
    test(
      'every reel in the analytics has a level that matches its reach',
      () async {
        final c = ProviderContainer(
          overrides: [mockLatencyProvider.overrideWithValue(Duration.zero)],
        );
        addTearDown(c.dispose);
        final a = await c
            .read(creatorInsightsRepositoryProvider)
            .getAnalytics(AnalyticsRange.days28);
        expect(a.reels, isNotEmpty);
        final levels = <ReachLevel>{};
        for (final r in a.reels) {
          final p = calc.evaluate(r.qualifiedReach);
          levels.add(p.current);
          // The level is derived from the reach, never stored on the reel.
          expect(p.qualifiedReach, r.qualifiedReach);
          if (p.next != null) {
            expect(
              p.remainingToNext,
              calc.config.thresholdFor(p.next!) - r.qualifiedReach,
            );
          }
        }
        expect(levels, isNotEmpty);
      },
    );

    test('the creator\'s 30-day reach sits on the ladder', () {
      final p = calc.evaluate(1281392);
      expect(p.current, ReachLevel.global);
    });
  });
}
