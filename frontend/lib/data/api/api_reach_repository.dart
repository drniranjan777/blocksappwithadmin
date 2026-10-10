import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/repositories/reach_repository.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

/// The Reach Ladder as the server publishes it (`GET /reach/ladder`).
///
/// The thresholds are read once and kept for [maxAge] (the admin console can
/// change them, and a new version applies from the next read). The app has no
/// built-in copy to fall back on: if the ladder cannot be read, the failure is
/// shown rather than a made-up threshold.
class ApiReachRepository implements ReachRepository {
  ApiReachRepository(
    this._api, {
    DateTime Function()? now,
    this.maxAge = const Duration(minutes: 10),
  }) : _now = now ?? DateTime.now;

  final ApiClient _api;
  final DateTime Function() _now;
  final Duration maxAge;

  ReachConfig? _config;
  DateTime? _readAt;
  Future<ReachConfig>? _loading;

  @override
  Future<ReachConfig> getConfig() {
    final config = _config;
    final readAt = _readAt;
    if (config != null &&
        readAt != null &&
        _now().difference(readAt) < maxAge) {
      return Future.value(config);
    }
    // Several screens ask at once on start-up: they share one request.
    return _loading ??= _load().whenComplete(() => _loading = null);
  }

  Future<ReachConfig> _load() async {
    final answer = await _api.get('/reach/ladder');
    final unlock = <ReachLevel, int>{};
    for (final row in JsonObject.of(answer.data).objects('levels')) {
      final level = switch (row.string('key')) {
        'DISTRICT' => ReachLevel.district,
        'STATE' => ReachLevel.state,
        'NATIONAL' => ReachLevel.national,
        'GLOBAL' => ReachLevel.global,
        _ => null,
      };
      if (level != null) unlock[level] = row.integer('minQualifiedReach');
    }
    if (unlock.length != ReachLevel.values.length) {
      throw const UnknownFailure('The server sent something unexpected');
    }
    final config = ReachConfig(unlockAt: Map.unmodifiable(unlock));
    _config = config;
    _readAt = _now();
    return config;
  }

  /// The lowest qualified reach that unlocks [level], once the ladder is known.
  /// Used to show a server-decided rung (see `postFromView`).
  Future<ReachFloor> floors() async {
    final config = await getConfig();
    return config.thresholdFor;
  }

  /// Boosting a post is a demo-only tool and does not exist on the server.
  @override
  Future<ReachBoostResult> simulateBoost(
    String postId, {
    int amount = 25000,
  }) async => throw const ForbiddenFailure('Not available');
}
