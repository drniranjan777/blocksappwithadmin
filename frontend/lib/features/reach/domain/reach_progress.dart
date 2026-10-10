import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';

/// Where a piece of content (or a creator) currently sits on the ladder.
class ReachProgress extends Equatable {
  const ReachProgress({
    required this.qualifiedReach,
    required this.current,
    required this.next,
    required this.fractionToNext,
    required this.remainingToNext,
  });

  final int qualifiedReach;
  final ReachLevel current;
  final ReachLevel? next;

  /// 0.0-1.0 progress through the current level towards [next].
  /// Always 1.0 at the top of the ladder.
  final double fractionToNext;

  /// Qualified reach still needed to unlock [next]; 0 at the top.
  final int remainingToNext;

  int get percentToNext => (fractionToNext * 100).floor();

  @override
  List<Object?> get props => [
    qualifiedReach,
    current,
    next,
    fractionToNext,
    remainingToNext,
  ];
}

/// Pure, side-effect-free ladder maths. Heavy lifting stays on the server in
/// production; the client only presents the numbers it is given.
class ReachCalculator {
  const ReachCalculator(this.config);

  final ReachConfig config;

  ReachProgress evaluate(int qualifiedReach) {
    if (qualifiedReach < 0) {
      throw ArgumentError.value(
        qualifiedReach,
        'qualifiedReach',
        'must not be negative',
      );
    }

    var current = ReachLevel.district;
    for (final level in ReachLevel.values) {
      if (qualifiedReach >= config.thresholdFor(level)) current = level;
    }

    final next = current.next;
    if (next == null) {
      return ReachProgress(
        qualifiedReach: qualifiedReach,
        current: current,
        next: null,
        fractionToNext: 1,
        remainingToNext: 0,
      );
    }

    final floor = config.thresholdFor(current);
    final ceiling = config.thresholdFor(next);
    final fraction = ((qualifiedReach - floor) / (ceiling - floor)).clamp(
      0.0,
      1.0,
    );
    return ReachProgress(
      qualifiedReach: qualifiedReach,
      current: current,
      next: next,
      fractionToNext: fraction,
      remainingToNext: ceiling - qualifiedReach,
    );
  }
}
