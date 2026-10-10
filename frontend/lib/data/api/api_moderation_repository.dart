import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/api/unavailable_repositories.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';

/// Reporting, blocking and muting against the real API.
///
/// A report is only ever a complaint: the server decides its severity, who
/// looks at it and what comes of it, and the app is never told who else
/// reported the same thing or what was decided. Reporting the same thing for
/// the same reason twice is harmless (the server answers with the first), so a
/// retry or a double tap needs no care here.
class ApiModerationRepository implements ModerationRepository {
  ApiModerationRepository(this._api);

  /// People blocked or muted are read this many pages at a time at most: far
  /// more than anyone has, and a bound on a runaway loop.
  static const _maxPages = 20;

  final ApiClient _api;

  @override
  Future<void> report(ReportRequest request) async {
    final details = request.details?.trim();
    await _api.post(
      '/reports',
      body: {
        'targetType': _target(request.targetType),
        'targetId': request.targetId,
        'category': _category(request.reason),
        if (details != null && details.isNotEmpty) 'description': details,
      },
    );
  }

  @override
  Future<void> blockUser(String userId) async {
    await _api.post('/users/${seg(userId)}/block');
  }

  @override
  Future<void> unblockUser(String userId) async {
    await _api.delete('/users/${seg(userId)}/block');
  }

  @override
  Future<void> muteUser(String userId) async {
    await _api.post('/users/${seg(userId)}/mute');
  }

  @override
  Future<void> unmuteUser(String userId) async {
    await _api.delete('/users/${seg(userId)}/mute');
  }

  /// "Restrict" (limit what someone can do to you without them knowing) is not
  /// something the server offers: blocking and muting are.
  @override
  Future<void> restrictUser(String userId) =>
      Future<void>.error(featureUnavailable);

  @override
  Future<List<UserSummary>> getBlockedUsers() => _people('BLOCK');

  @override
  Future<List<UserSummary>> getMutedUsers() => _people('MUTE');

  @override
  Future<Set<String>> getHiddenUserIds() async {
    final both = await Future.wait([getBlockedUsers(), getMutedUsers()]);
    return {
      for (final list in both)
        for (final u in list) u.id,
    };
  }

  Future<List<UserSummary>> _people(String kind) async {
    final out = <UserSummary>[];
    String? cursor;
    for (var page = 0; page < _maxPages; page++) {
      final answer = await _api.get(
        '/users/me/blocks',
        query: {'kind': kind, 'cursor': cursor, 'limit': maxPageSize},
      );
      out.addAll(answer.objects().map(userSummaryFromCard));
      if (!answer.hasMore) break;
      cursor = answer.nextCursor;
    }
    return out;
  }

  static String _target(ReportTargetType type) => switch (type) {
    ReportTargetType.post => 'POST',
    ReportTargetType.reel => 'REEL',
    ReportTargetType.comment => 'COMMENT',
    ReportTargetType.user => 'USER',
  };

  static String _category(ReportReason reason) => switch (reason) {
    ReportReason.spam => 'SPAM',
    ReportReason.harassment => 'HARASSMENT',
    ReportReason.nudity => 'NUDITY',
    ReportReason.violence => 'VIOLENCE',
    ReportReason.selfHarm => 'SELF_HARM',
    ReportReason.misinformation => 'MISINFORMATION',
    ReportReason.scam => 'FRAUD',
    ReportReason.other => 'OTHER',
  };
}
