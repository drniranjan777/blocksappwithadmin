import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/demo_credentials.dart';
import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_factory.dart';
import 'package:blocks_app/data/mock/mock_paging.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/auth_repository.dart';
import 'package:blocks_app/data/repositories/business_repository.dart';
import 'package:blocks_app/data/repositories/message_repository.dart';
import 'package:blocks_app/data/repositories/misc_repositories.dart';
import 'package:blocks_app/data/repositories/notification_repository.dart';
import 'package:blocks_app/data/repositories/reach_repository.dart';
import 'package:blocks_app/data/repositories/user_repository.dart';
import 'package:blocks_app/features/business/domain/campaign_rules.dart';
import 'package:blocks_app/features/security/domain/login_attempt_tracker.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/domain/reach_progress.dart';

class MockAuthRepository implements AuthRepository {
  MockAuthRepository(this._store, this._w);
  final LocalStore _store;
  final MockWorld _w;

  @override
  bool get hasCompletedOnboarding =>
      _store.getBool(StorageKeys.onboardingCompleted) ?? false;

  @override
  bool get isSignedIn => _store.getBool(StorageKeys.demoSessionActive) ?? false;

  @override
  Future<void> completeOnboarding() =>
      _store.setBool(StorageKeys.onboardingCompleted, value: true);

  @override
  Future<void> signInAsDemo() async {
    await _store.setBool(StorageKeys.onboardingCompleted, value: true);
    await _store.setBool(StorageKeys.demoSessionActive, value: true);
  }

  /// The mock *server* side of password sign-in: it counts the failures and
  /// decides when to apply temporary protection; the app only learns the
  /// outcome and never sends or sees a counter.
  @override
  Future<LoginResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    await _w.pause();
    final s = _w.security;
    final now = s.now();

    // Already protected: refuse without counting or alerting again.
    final waiting = s.tracker.protectedUntil(now);
    if (waiting != null) return LoginProtected(retryAt: waiting);

    final correct =
        DemoCredentials.matchesIdentifier(
          identifier,
          email: s.email,
          phone: s.phone,
        ) &&
        password == s.password;

    if (correct) {
      s.tracker.recordSuccess();
      final isNewDevice = s.registerSignIn(s.currentDevice);
      s.raise(
        SecurityEventType.loginSuccess,
        device: s.currentDevice,
        newDevice: isNewDevice,
      );
      await _store.setBool(StorageKeys.onboardingCompleted, value: true);
      await _store.setBool(StorageKeys.demoSessionActive, value: true);
      return LoginSucceeded(isNewDevice: isNewDevice);
    }

    final outcome = s.tracker.recordFailure(now);
    s.raise(SecurityEventType.loginFailed, device: s.currentDevice);
    switch (outcome) {
      case AttemptRejected(:final attemptsRemaining):
        return LoginRejected(attemptsRemaining: attemptsRemaining);
      case AttemptProtectionTriggered(
        :final failedAttempts,
        :final protectedUntil,
      ):
        s.raise(
          SecurityEventType.suspiciousLogin,
          device: s.currentDevice,
          attempts: failedAttempts,
        );
        return LoginProtected(retryAt: protectedUntil, justTriggered: true);
      case AttemptWhileProtected(:final protectedUntil):
        return LoginProtected(retryAt: protectedUntil);
    }
  }

  // The demo has one built-in account; creating or confirming accounts needs
  // the live service.
  @override
  Future<CodeChallenge> register(RegistrationRequest request) async =>
      throw const ForbiddenFailure(
        'Creating an account needs the live service',
      );

  @override
  Future<LoginSucceeded> submitCode(
    CodeChallenge challenge,
    String code, {
    SignInCodeMethod method = SignInCodeMethod.otp,
  }) async => throw const ForbiddenFailure('Codes need the live service');

  @override
  Future<CodeChallenge> resendCode(CodeChallenge challenge) async =>
      throw const ForbiddenFailure('Codes need the live service');

  @override
  Future<void> signOut() =>
      _store.setBool(StorageKeys.demoSessionActive, value: false);
}

class MockUserRepository implements UserRepository {
  MockUserRepository(this._w);
  final MockWorld _w;

  @override
  Future<AppUser> getCurrentUser() async {
    await _w.pause();
    return _w.me;
  }

  @override
  Future<AppUser> getUser(String id) async {
    await _w.pause();
    return _w.factory.user(id);
  }

  @override
  Future<Set<String>> getFollowingIds() async => {..._w.following};

  @override
  Future<void> follow(String userId) async {
    if (userId == meId) throw const ValidationFailure('cannotFollowSelf');
    // Business pages are followable entities too (ids are "biz_*").
    if (userId.startsWith('biz_')) {
      _w.factory.business(userId);
    } else {
      _w.factory.user(userId);
    }
    if (_w.following.add(userId)) {
      _w.me = _w.me.copyWith(followingCount: _w.me.followingCount + 1);
    }
  }

  @override
  Future<void> unfollow(String userId) async {
    if (_w.following.remove(userId)) {
      _w.me = _w.me.copyWith(followingCount: _w.me.followingCount - 1);
    }
  }

  @override
  Future<List<UserSummary>> searchUsers(String query, {int limit = 10}) async {
    await _w.pause();
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return kUserSeeds
        .where(
          (u) =>
              u.name.toLowerCase().contains(q) ||
              u.handle.toLowerCase().contains(q),
        )
        .take(limit)
        .map((u) => _w.factory.summaryOf(u.id))
        .toList();
  }

  @override
  Future<AppUser> setTwoFactorEnabled({required bool enabled}) async {
    await _w.pause();
    _w.me = _w.me.copyWith(isTwoFactorEnabled: enabled);
    _w.security.twoFactor = _w.security.twoFactor.copyWith(enabled: enabled);
    return _w.me;
  }
}

class MockNotificationRepository implements NotificationRepository {
  MockNotificationRepository(this._w);
  final MockWorld _w;

  /// Live security alerts (newest first) ahead of the generated history, with
  /// read state applied.
  List<AppNotification> get _securityAlerts => [
    for (final n in _w.security.notifications)
      n.copyWith(isRead: _w.readNotifications.contains(n.id)),
  ];

  @override
  Future<PagedResult<AppNotification>> getNotifications({
    NotificationCategory? category,
    String? cursor,
    int limit = 20,
  }) async {
    await _w.pause();
    final live = _securityAlerts;
    return pageByIndex<AppNotification>(
      cursor: cursor,
      limit: limit,
      total: live.length + MockFactory.notificationCount,
      build: (i) =>
          i < live.length ? live[i] : _w.factory.notification(i - live.length),
      keep: (n) => category == null || n.category == category,
    );
  }

  @override
  Future<int> getUnreadCount() async {
    var n = _securityAlerts.where((a) => !a.isRead).length;
    for (var i = 0; i < MockFactory.unreadSeedCount; i++) {
      if (!_w.readNotifications.contains('n~$i')) n++;
    }
    return n;
  }

  @override
  Future<void> markAllRead() async {
    for (final a in _w.security.notifications) {
      _w.readNotifications.add(a.id);
    }
    for (var i = 0; i < MockFactory.unreadSeedCount; i++) {
      _w.readNotifications.add('n~$i');
    }
  }

  @override
  Future<void> markRead(String id) async => _w.readNotifications.add(id);
}

class MockMessageRepository implements MessageRepository {
  MockMessageRepository(this._w);
  final MockWorld _w;

  @override
  Future<List<Conversation>> getConversations({String query = ''}) async {
    await _w.pause();
    final q = query.trim().toLowerCase();
    final hidden = _w.hiddenUserIds;
    final list =
        _w.conversations.values
            .where((c) => !hidden.contains(c.participant.id))
            .where(
              (c) =>
                  q.isEmpty ||
                  c.participant.name.toLowerCase().contains(q) ||
                  c.participant.username.toLowerCase().contains(q),
            )
            .toList()
          ..sort((a, b) => b.lastAt.compareTo(a.lastAt));
    return list;
  }

  @override
  Future<Conversation> getConversation(String id) async {
    final c = _w.conversations[id];
    if (c == null) throw NotFoundFailure('Conversation $id not found');
    return c;
  }

  @override
  Future<PagedResult<ChatMessage>> getMessages(
    String conversationId, {
    String? cursor,
    int limit = 30,
  }) async {
    await _w.pause();
    await getConversation(conversationId);
    final all = [...(_w.messages[conversationId] ?? const <ChatMessage>[])]
      ..sort((a, b) => b.sentAt.compareTo(a.sentAt));
    return pageByIndex<ChatMessage>(
      cursor: cursor,
      limit: limit,
      total: all.length,
      build: (i) => all[i],
    );
  }

  @override
  Future<ChatMessage> sendMessage(String conversationId, String text) async {
    await _w.pause();
    final conv = await getConversation(conversationId);
    final trimmed = text.trim();
    if (trimmed.isEmpty) throw const ValidationFailure('messageEmpty');
    final msg = ChatMessage(
      id: _w.nextId('m~mine'),
      conversationId: conversationId,
      kind: MessageKind.text,
      text: trimmed,
      isMine: true,
      sentAt: _w.now(),
    );
    _w.messages.putIfAbsent(conversationId, () => []).add(msg);
    _w.conversations[conversationId] = Conversation(
      id: conv.id,
      participant: conv.participant,
      lastMessage: trimmed,
      lastAt: msg.sentAt,
      isOnline: conv.isOnline,
    );
    return msg;
  }

  @override
  Future<void> markConversationRead(String conversationId) async {
    final c = _w.conversations[conversationId];
    if (c == null) return;
    _w.conversations[conversationId] = Conversation(
      id: c.id,
      participant: c.participant,
      lastMessage: c.lastMessage,
      lastAt: c.lastAt,
      isOnline: c.isOnline,
    );
  }

  @override
  Future<Conversation> conversationWith(String userId) async {
    final id = 'cv~$userId';
    final existing = _w.conversations[id];
    if (existing != null) return existing;
    final conv = Conversation(
      id: id,
      participant: _w.factory.summaryOf(userId),
      lastMessage: '',
      lastAt: _w.now(),
    );
    _w.conversations[id] = conv;
    _w.messages[id] = [];
    return conv;
  }
}

class MockBusinessRepository implements BusinessRepository {
  MockBusinessRepository(this._w);
  final MockWorld _w;

  @override
  Future<BusinessProfile> getMyBusiness() => getBusiness(myBusinessId);

  @override
  Future<BusinessProfile> getBusiness(String id) async {
    await _w.pause();
    return _w.factory.business(id);
  }

  @override
  Future<List<Offer>> getOffers(String businessId) async {
    await _w.pause();
    _w.factory.business(businessId);
    return _w.factory.offers(businessId);
  }

  @override
  Future<PagedResult<Post>> getBusinessPosts(
    String businessId, {
    String? cursor,
    int limit = 18,
  }) async {
    await _w.pause();
    _w.factory.business(businessId);
    return pageByIndex<Post>(
      cursor: cursor,
      limit: limit,
      total: 12,
      build: (i) => _w.factory.tryPost('p~biz~$businessId~$i'),
    );
  }
}

class MockReachRepository implements ReachRepository {
  MockReachRepository(this._w);
  final MockWorld _w;

  @override
  Future<ReachConfig> getConfig() async => _w.reachConfig;

  @override
  Future<ReachBoostResult> simulateBoost(
    String postId, {
    int amount = 25000,
  }) async {
    await _w.pause();
    final calc = ReachCalculator(_w.reachConfig);
    final before = calc.evaluate(_w.factory.post(postId).qualifiedReach);
    _w.reachBoost.update(postId, (v) => v + amount, ifAbsent: () => amount);
    final after = calc.evaluate(_w.factory.post(postId).qualifiedReach);

    // A creator's headline level is the best level any of their posts has hit.
    if (_w.factory.post(postId).author.id == meId &&
        after.qualifiedReach > _w.me.bestPostReach) {
      _w.me = _w.me.copyWith(
        bestPostReach: after.qualifiedReach,
        reachLevel: after.current.index > _w.me.reachLevel.index
            ? after.current
            : null,
      );
    }
    return ReachBoostResult(before: before, after: after);
  }
}

class MockCreatorRepository implements CreatorRepository {
  MockCreatorRepository(this._w);
  final MockWorld _w;

  @override
  Future<CreatorDashboard> getDashboard() async {
    await _w.pause();
    var best = 0;
    for (var i = 0; i < 8; i++) {
      final p = _w.factory.post('p~user~$meId~$i');
      if (p.qualifiedReach > best) best = p.qualifiedReach;
    }
    return CreatorDashboard(
      followers: _w.me.followersCount,
      qualifiedReach30d: 1281392,
      bestPostQualifiedReach: best,
      coverage: const {
        ReachLevel.district: 1.0,
        ReachLevel.state: 0.82,
        ReachLevel.national: 0.31,
        ReachLevel.global: 0.06,
      },
      reachLevel: _w.me.reachLevel,
    );
  }
}

class MockAdRepository implements AdRepository {
  MockAdRepository(this._w);
  final MockWorld _w;

  @override
  Future<List<Campaign>> getCampaigns() async =>
      List.unmodifiable(_w.campaigns);

  @override
  Future<Campaign> createCampaign(CampaignDraft draft) async {
    await _w.pause();
    CampaignRules.ensureValid(draft);
    final (lo, hi) = CampaignRules.estimateReach(draft);
    final c = Campaign(
      id: _w.nextId('cmp'),
      draft: draft,
      status: CampaignStatus.demo,
      estimatedReachMin: lo,
      estimatedReachMax: hi,
      createdAt: _w.now(),
    );
    _w.campaigns.insert(0, c);
    return c;
  }
}

class MockVerificationRepository implements VerificationRepository {
  MockVerificationRepository(this._w);
  final MockWorld _w;

  @override
  Future<VerificationStatus> getStatus() async => _w.verification;

  @override
  Future<VerificationStatus> submit(VerificationType type) async {
    await _w.pause();
    _w.verification = VerificationStatus(
      state: VerificationState.pending,
      type: type,
      submittedAt: _w.now(),
    );
    return _w.verification;
  }

  @override
  Future<VerificationStatus> approveForDemo() async {
    await _w.pause();
    final current = _w.verification;
    if (current.state != VerificationState.pending) return current;
    _w.verification = VerificationStatus(
      state: VerificationState.verified,
      type: current.type,
      submittedAt: current.submittedAt,
    );
    _w.me = _w.me.copyWith(isVerified: true, verificationType: current.type);
    return _w.verification;
  }
}

class MockModerationRepository implements ModerationRepository {
  MockModerationRepository(this._w);
  final MockWorld _w;

  @override
  Future<void> report(ReportRequest request) async {
    await _w.pause();
    _w.reports.add(request);
  }

  @override
  Future<void> blockUser(String userId) async {
    _guardSelf(userId);
    _w.blocked.add(userId);
    _w.muted.remove(userId);
    if (_w.following.remove(userId)) {
      _w.me = _w.me.copyWith(followingCount: _w.me.followingCount - 1);
    }
  }

  @override
  Future<void> unblockUser(String userId) async => _w.blocked.remove(userId);

  @override
  Future<void> muteUser(String userId) async {
    _guardSelf(userId);
    _w.muted.add(userId);
  }

  @override
  Future<void> unmuteUser(String userId) async => _w.muted.remove(userId);

  @override
  Future<void> restrictUser(String userId) async {
    _guardSelf(userId);
    _w.restricted.add(userId);
  }

  void _guardSelf(String userId) {
    if (userId == meId) throw const ValidationFailure('cannotTargetSelf');
  }

  @override
  Future<List<UserSummary>> getBlockedUsers() async =>
      _w.blocked.map(_w.factory.summaryOf).toList();

  @override
  Future<List<UserSummary>> getMutedUsers() async =>
      _w.muted.map(_w.factory.summaryOf).toList();

  @override
  Future<Set<String>> getHiddenUserIds() async => _w.hiddenUserIds;
}
