import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:equatable/equatable.dart';

class ReachBoostResult extends Equatable {
  const ReachBoostResult({required this.before, required this.after});

  final ReachProgress before;
  final ReachProgress after;

  bool get didLevelUp => after.current.index > before.current.index;

  @override
  List<Object?> get props => [before, after];
}

abstract interface class ReachRepository {
  /// Thresholds are server-controlled (admin console); the client never
  /// hard-codes them.
  Future<ReachConfig> getConfig();

  /// Demo only: adds qualified reach to a post so the unlock celebration can
  /// be shown. Does not exist in the production API.
  Future<ReachBoostResult> simulateBoost(String postId, {int amount = 25000});
}
