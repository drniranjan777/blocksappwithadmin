/// Single source of truth for route paths. Never inline path strings.
abstract final class Routes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const auth = '/auth';

  // Shell tabs
  static const home = '/home';
  static const explore = '/explore';
  static const reels = '/reels';
  static const profile = '/profile';

  /// Where a signed-in user lands after the splash and after signing in.
  /// BLOCKS opens on full-screen Reels, not the Home feed.
  static const landing = reels;

  // Full-screen flows (pushed above the shell, no bottom nav)
  static const create = '/create';
  static const createPost = '/create/post';
  static const createReel = '/create/reel';
  static const reelMusic = '/create/reel/music';
  static const reelDetails = '/create/reel/details';
  static const reelPublishing = '/create/reel/publishing';
  static const createStory = '/create/story';
  static const createLive = '/create/live';

  /// The reel editor, optionally continuing a saved draft.
  static String reelEditor({String? draftId}) =>
      draftId == null ? createReel : '$createReel?draft=$draftId';

  static const notifications = '/notifications';
  static const messages = '/messages';

  // Creator Studio: Overview / Content / Analytics / Reach / Earnings / Payout
  static const creatorStudio = '/creator-studio';
  static const creatorReels = '/creator-studio/reels';
  static const creatorPosts = '/creator-studio/posts';
  static const creatorDrafts = '/creator-studio/drafts';
  static const creatorAnalytics = '/creator-studio/analytics';
  static const creatorReach = '/creator-studio/reach';
  static const creatorEarnings = '/creator-studio/earnings';
  static const creatorMusic = '/creator-studio/music';
  static const payoutCenter = '/creator-studio/payout';
  static const payoutVerification = '/creator-studio/payout/verification';
  static const payoutBank = '/creator-studio/payout/bank';
  static const payoutHistory = '/creator-studio/payout/history';
  static const payoutTax = '/creator-studio/payout/tax';
  static const kycFlow = '/creator-studio/payout/verification/start';
  static const addBank = '/creator-studio/payout/bank/add';
  static const requestPayout = '/creator-studio/payout/request';
  static String reelAnalytics(String reelId) =>
      '/creator-studio/analytics/$reelId';
  static const promote = '/promote';
  static const verification = '/verification';
  static const safety = '/safety';
  static const settings = '/settings';
  static const blocked = '/settings/blocked';
  static const muted = '/settings/muted';

  // Public auth sub-flows (reachable while signed out)
  static const signIn = '/auth/sign-in';
  static const signUp = '/auth/sign-up';

  /// "Enter the code we sent you": the second step of sign-up and of a
  /// sign-in that needs one. Opened with a `CodeChallenge` as the route extra.
  static const verifyCode = '/auth/code';
  static const forgotPassword = '/auth/forgot';

  // Profile
  static const editProfile = '/profile/edit';

  // Security (all under Settings; static segments sit before ":kind")
  static const security = '/settings/security';
  static const changePassword = '/settings/security/password';
  static const resetPassword = '/settings/security/reset-password';
  static const changeEmail = '/settings/security/email';
  static const changePhone = '/settings/security/phone';
  static const twoFactor = '/settings/security/two-factor';
  static const loginActivity = '/settings/security/activity';
  static const devices = '/settings/security/devices';
  static const securityNotifications = '/settings/security/notifications';
  static const securityDemo = '/settings/security/demo';
  static String securityAlert(String eventId) =>
      '/settings/security/alert/$eventId';

  // Parameterised
  static String post(String id) => '/post/$id';
  static String user(String id) => '/user/$id';
  static String story(String groupId) => '/story/$groupId';
  static String chat(String conversationId) => '/messages/$conversationId';
  static String business(String id) => '/business/$id';
  static String info(String topic) => '/info/$topic';
}
