import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';

/// Thresholds for the Reach Ladder.
///
/// DEMO VALUES ONLY — they are not business rules. In production these are
/// served from the admin-configurable settings service and must never be
/// hard-coded into the client.
class ReachConfig extends Equatable {
  const ReachConfig({required this.unlockAt});

  /// Demo thresholds: District 0-10,000 · State 10,001-100,000 ·
  /// National 100,001-1,000,000 · Global 1,000,001+ qualified reach.
  const ReachConfig.demo()
    : unlockAt = const {
        ReachLevel.district: 0,
        ReachLevel.state: 10001,
        ReachLevel.national: 100001,
        ReachLevel.global: 1000001,
      };

  /// Minimum qualified reach at which each level is unlocked.
  final Map<ReachLevel, int> unlockAt;

  int thresholdFor(ReachLevel level) => unlockAt[level]!;

  @override
  List<Object?> get props => [unlockAt];
}
