import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const calculator = ReachCalculator(ReachConfig.demo());

  group('level transitions (demo thresholds)', () {
    test('District -> State at 10,001 qualified reach', () {
      expect(calculator.evaluate(10000).current, ReachLevel.district);
      expect(calculator.evaluate(10001).current, ReachLevel.state);
    });

    test('State -> National at 100,001 qualified reach', () {
      expect(calculator.evaluate(100000).current, ReachLevel.state);
      expect(calculator.evaluate(100001).current, ReachLevel.national);
    });

    test('National -> Global at 1,000,001 qualified reach', () {
      expect(calculator.evaluate(1000000).current, ReachLevel.national);
      expect(calculator.evaluate(1000001).current, ReachLevel.global);
    });

    test('zero reach is District', () {
      final p = calculator.evaluate(0);
      expect(p.current, ReachLevel.district);
      expect(p.next, ReachLevel.state);
      expect(p.fractionToNext, 0);
    });
  });

  group('progress towards next level', () {
    test('computes fraction and remaining reach', () {
      // Halfway between State (10,001) and National (100,001).
      final p = calculator.evaluate(55001);
      expect(p.current, ReachLevel.state);
      expect(p.next, ReachLevel.national);
      expect(p.fractionToNext, closeTo(0.5, 0.0001));
      expect(p.percentToNext, 50);
      expect(p.remainingToNext, 45000);
    });

    test('top of the ladder is complete with nothing remaining', () {
      final p = calculator.evaluate(5000000);
      expect(p.current, ReachLevel.global);
      expect(p.next, isNull);
      expect(p.fractionToNext, 1);
      expect(p.remainingToNext, 0);
    });

    test('fraction never exceeds 1 just below a threshold', () {
      final p = calculator.evaluate(10000);
      expect(p.fractionToNext, lessThanOrEqualTo(1));
      expect(p.remainingToNext, 1);
    });
  });

  group('configuration', () {
    test('thresholds come from config, not hard-coded logic', () {
      const custom = ReachCalculator(
        ReachConfig(
          unlockAt: {
            ReachLevel.district: 0,
            ReachLevel.state: 100,
            ReachLevel.national: 200,
            ReachLevel.global: 300,
          },
        ),
      );
      expect(custom.evaluate(99).current, ReachLevel.district);
      expect(custom.evaluate(100).current, ReachLevel.state);
      expect(custom.evaluate(300).current, ReachLevel.global);
    });
  });

  group('invalid input', () {
    test('negative qualified reach is rejected', () {
      expect(() => calculator.evaluate(-1), throwsArgumentError);
    });
  });

  group('ReachLevel', () {
    test('ladder order and next level', () {
      expect(ReachLevel.district.next, ReachLevel.state);
      expect(ReachLevel.state.next, ReachLevel.national);
      expect(ReachLevel.national.next, ReachLevel.global);
      expect(ReachLevel.global.next, isNull);
      expect(ReachLevel.values.map((l) => l.code), ['D1', 'S1', 'N1', 'G1']);
    });

    test('isAtLeast compares positions on the ladder', () {
      expect(ReachLevel.national.isAtLeast(ReachLevel.state), isTrue);
      expect(ReachLevel.district.isAtLeast(ReachLevel.state), isFalse);
    });
  });
}
