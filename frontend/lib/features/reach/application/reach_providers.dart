import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Server-controlled thresholds.
final reachConfigProvider = FutureProvider<ReachConfig>(
  (ref) => ref.watch(reachRepositoryProvider).getConfig(),
);

/// Always usable synchronously: falls back to the demo thresholds until the
/// remote config has loaded, so UI never has to handle a "no config" state.
final reachCalculatorProvider = Provider<ReachCalculator>((ref) {
  final config = ref.watch(reachConfigProvider).value;
  return ReachCalculator(config ?? const ReachConfig.demo());
});
