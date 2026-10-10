import 'package:blocks_app/data/mock/mock_catalog.dart';
import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_factory.dart';
import 'package:blocks_app/data/mock/mock_security_state.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/reach/domain/reach_config.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

/// The in-memory "server" behind every Mock*Repository.
///
/// Content is generated lazily by [MockFactory]; this class only stores what
/// the user changes (likes, follows, created posts, messages, ...), so memory
/// stays tiny no matter how far the user scrolls.
class MockWorld {
  MockWorld({
    DateTime Function()? clock,
    this.latency = Duration.zero,
    DeviceDescriptor? device,
  }) : now = clock ?? DateTime.now,
       currentDevice = device ?? _defaultDevice {
    factory = MockFactory(this);
    following.addAll(kUserSeeds.where((u) => u.following).map((u) => u.id));
    for (final c in factory.seedConversations()) {
      conversations[c.id] = c;
    }
  }

  static const _defaultDevice = DeviceDescriptor(
    name: 'This device',
    platform: 'Android',
    appOrBrowser: 'BLOCKS app',
    approximateLocation: 'Hyderabad, India',
  );

  final DateTime Function() now;

  /// Simulated network delay. Zero in tests.
  final Duration latency;
  late final MockFactory factory;

  /// How the "server" sees this device (see [DeviceDescriptor]).
  final DeviceDescriptor currentDevice;

  /// Mock auth / security server: sign-in counters, codes, sessions, alerts.
  late final MockSecurityState security = MockSecurityState(
    this,
    currentDevice,
  );

  /// Mock creator back-end: reel limits, identity verification, bank
  /// accounts, balances, payouts and uploads.
  late final MockCreatorState creator = MockCreatorState(this);

  /// Server-controlled ladder thresholds (demo values).
  final ReachConfig reachConfig = const ReachConfig.demo();

  AppUser me = const AppUser(
    id: meId,
    name: 'Aarav Kumar',
    username: '@aarav.blocks',
    bio: 'Hyderabad storyteller. Food, tech and the city I love.',
    district: 'Hyderabad',
    state: 'Telangana',
    followersCount: 18450,
    followingCount: 642,
    postsCount: 128,
    reachLevel: ReachLevel.state,
    bestPostReach: 71201,
    isVerified: true,
    verificationType: VerificationType.creator,
    accountAgeDays: 412,
    isTwoFactorEnabled: true,
    businessId: myBusinessId,
  );

  /// Owner-only details (kept apart from the public [me]).
  PrivateProfile privateProfile = PrivateProfile(
    dateOfBirth: DateTime(1996, 8, 14),
    gender: Gender.male,
  );

  // Interaction state ------------------------------------------------------
  final Set<String> liked = {};
  final Set<String> saved = {};
  final Map<String, int> shareBumps = {};
  final Map<String, int> reachBoost = {};
  final Set<String> following = {};
  final Set<String> blocked = {};
  final Set<String> muted = {};
  final Set<String> restricted = {};

  // Created content --------------------------------------------------------
  final List<Post> createdPosts = [];
  final List<Reel> createdReels = [];
  final List<StoryItem> myStories = [];
  final Map<String, List<Comment>> myComments = {};

  // Social ----------------------------------------------------------------
  final Set<String> viewedStories = {};
  final Set<String> readNotifications = {};
  final Map<String, Conversation> conversations = {};
  final Map<String, List<ChatMessage>> messages = {};

  // Business / trust --------------------------------------------------------
  final List<ReportRequest> reports = [];
  final List<Campaign> campaigns = [];
  VerificationStatus verification = const VerificationStatus(
    state: VerificationState.verified,
    type: VerificationType.creator,
  );

  /// Authors whose content must not appear (blocked or muted).
  Set<String> get hiddenUserIds => {...blocked, ...muted};

  int _seq = 0;
  String nextId(String prefix) => '$prefix~${++_seq}';

  Future<void> pause() => latency == Duration.zero
      ? Future<void>.value()
      : Future<void>.delayed(latency);

  /// A fraction of [latency], for the steps inside a longer simulated job.
  Future<void> pauseBrief([int divisor = 8]) => latency == Duration.zero
      ? Future<void>.value()
      : Future<void>.delayed(latency ~/ divisor);
}
