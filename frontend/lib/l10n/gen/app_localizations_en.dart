// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'BLOCKS';

  @override
  String get tagline => 'From Your Block to the World.';

  @override
  String get madeInIndia => 'Made in India';

  @override
  String get splashLoadingSemantics => 'BLOCKS is loading. Made in India.';

  @override
  String get skip => 'Skip';

  @override
  String get next => 'Next';

  @override
  String get getStarted => 'Get Started';

  @override
  String get exploreDemo => 'Explore Demo';

  @override
  String get continueAsDemoUser => 'Continue as Demo User';

  @override
  String pageIndicatorSemantics(int current, int total) {
    return 'Page $current of $total';
  }

  @override
  String get onboarding1Title => 'Welcome to BLOCKS';

  @override
  String get onboarding1Body =>
      'Your voice starts local and can reach the world.';

  @override
  String get onboarding2Title => 'From District to the World';

  @override
  String get onboarding2Body =>
      'Great posts earn their way up through qualified reach, not follower counts.';

  @override
  String get onboarding3Title => 'Create. Share. Grow.';

  @override
  String get onboarding3Body =>
      'Share posts, reels and stories with your community and watch them travel.';

  @override
  String get onboarding4Title => 'Earn from Your Impact';

  @override
  String get onboarding4Body =>
      'Rewards follow qualified reach and trust, never raw view counts.';

  @override
  String get onboarding5Title => 'Build Your Business';

  @override
  String get onboarding5Body =>
      'Create a business page, reach nearby customers and promote what matters.';

  @override
  String get levelDistrict => 'District';

  @override
  String get levelState => 'State';

  @override
  String get levelNational => 'National';

  @override
  String get levelGlobal => 'Global';

  @override
  String levelBadgeSemantics(String code, String name) {
    return 'Reach level $code, $name';
  }

  @override
  String get navHome => 'Home';

  @override
  String get navExplore => 'Explore';

  @override
  String get navCreate => 'Create';

  @override
  String get navReels => 'Reels';

  @override
  String get navProfile => 'Profile';

  @override
  String get authTitle => 'Welcome to BLOCKS';

  @override
  String get authSubtitle =>
      'This is a demo experience. No account or internet connection is needed.';

  @override
  String get authDemoCardCaption => 'Signing in as the demo creator';

  @override
  String get authFootnote => 'Demo data is generated on your device.';

  @override
  String get close => 'Close';

  @override
  String get retry => 'Try again';

  @override
  String get emptyTitle => 'Nothing here yet';

  @override
  String get emptyBody => 'Be the first to create something.';

  @override
  String get errorTitle => 'Something went wrong';

  @override
  String get errorBody => 'Please check your connection and try again.';

  @override
  String get unavailableTitle => 'Not available yet';

  @override
  String get unavailableBody =>
      'This part of BLOCKS is not open to your account yet. Please check back soon.';

  @override
  String get loading => 'Loading';

  @override
  String get feedFollowing => 'Following';

  @override
  String get feedForYou => 'For You';

  @override
  String get feedRising => 'Rising';

  @override
  String get feedNearYou => 'Near You';

  @override
  String get feedIndia => 'India';

  @override
  String get searchTooltip => 'Search';

  @override
  String get notificationsTooltip => 'Notifications';

  @override
  String get profileTooltip => 'Your profile';

  @override
  String get messagesTooltip => 'Messages';

  @override
  String get yourStory => 'Your story';

  @override
  String storyOfSemantics(String name) {
    return '$name\'s story';
  }

  @override
  String get addToStorySemantics => 'Add to your story';

  @override
  String get postMoreOptions => 'More options';

  @override
  String get actionLike => 'Like';

  @override
  String get actionUnlike => 'Unlike';

  @override
  String get actionComment => 'Comment';

  @override
  String get actionShare => 'Share';

  @override
  String get actionSave => 'Save';

  @override
  String get actionUnsave => 'Remove from saved';

  @override
  String likeSemantics(String label, String count) {
    return '$label, $count likes';
  }

  @override
  String commentSemantics(String count) {
    return 'Comments, $count';
  }

  @override
  String shareSemantics(String count) {
    return 'Share, $count shares';
  }

  @override
  String get captionMore => 'more';

  @override
  String get captionLess => 'less';

  @override
  String get postSaved => 'Saved to your collection';

  @override
  String get postUnsaved => 'Removed from saved';

  @override
  String postCardSemantics(String name, String location) {
    return 'Post by $name from $location';
  }

  @override
  String get videoLabel => 'Video';

  @override
  String get risingBadge => 'RISING';

  @override
  String risingOwn(int percent, String level) {
    return 'Your post is $percent% toward $level level';
  }

  @override
  String risingOther(int percent, String level) {
    return 'This post is $percent% toward $level level';
  }

  @override
  String get risingCurrent => 'Current';

  @override
  String get risingNext => 'Next';

  @override
  String risingRemaining(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return '$countString more qualified interactions needed';
  }

  @override
  String get risingTopLevel => 'Top of the ladder reached';

  @override
  String ladderSemantics(String summary) {
    return 'Reach ladder. $summary';
  }

  @override
  String ladderReachedSemantics(String level) {
    return '$level reached';
  }

  @override
  String ladderProgressSemantics(String level, int percent) {
    return '$level $percent percent';
  }

  @override
  String ladderLockedSemantics(String level) {
    return '$level locked';
  }

  @override
  String get reachJourney => 'Reach journey';

  @override
  String get reachQualifiedLabel => 'Qualified reach';

  @override
  String get reachSimulateBoost => 'Simulate reach boost (demo)';

  @override
  String get reachBoostDone => 'Reach boosted for the demo';

  @override
  String get reachExplain =>
      'Only qualified reach counts: real, distinct viewers and meaningful engagement.';

  @override
  String get statViews => 'Views';

  @override
  String get statLikes => 'Likes';

  @override
  String get statComments => 'Comments';

  @override
  String get statShares => 'Shares';

  @override
  String get statSaves => 'Saves';

  @override
  String levelUnlockedTitle(String level) {
    return 'You reached $level level!';
  }

  @override
  String levelUnlockedBody(String level) {
    return 'Your content is now eligible for $level discovery.';
  }

  @override
  String get celebrationContinue => 'Awesome';

  @override
  String get commentsTitle => 'Comments';

  @override
  String get commentsHint => 'Add a comment…';

  @override
  String get commentPost => 'Post';

  @override
  String get commentsEmptyTitle => 'No comments yet';

  @override
  String get commentsEmptyBody => 'Start the conversation.';

  @override
  String viewAllComments(String count) {
    return 'View all $count comments';
  }

  @override
  String get shareTitle => 'Share';

  @override
  String get shareSubtitle =>
      'Every share from a new district helps this post climb.';

  @override
  String get shareCopyLink => 'Copy link';

  @override
  String get shareToStory => 'Add to story';

  @override
  String get shareInMessage => 'Send in message';

  @override
  String get shareMore => 'More';

  @override
  String get linkCopied => 'Link copied';

  @override
  String get sharedToast => 'Shared';

  @override
  String get actionReport => 'Report';

  @override
  String actionMute(String username) {
    return 'Mute $username';
  }

  @override
  String actionBlock(String username) {
    return 'Block $username';
  }

  @override
  String actionRestrict(String username) {
    return 'Restrict $username';
  }

  @override
  String confirmBlockTitle(String username) {
    return 'Block $username?';
  }

  @override
  String get confirmBlockBody =>
      'They won\'t be able to find your profile, and you won\'t see their posts.';

  @override
  String get cancel => 'Cancel';

  @override
  String mutedToast(String username) {
    return '$username muted';
  }

  @override
  String blockedToast(String username) {
    return '$username blocked';
  }

  @override
  String restrictedToast(String username) {
    return '$username restricted';
  }

  @override
  String get reportTitle => 'Why are you reporting this?';

  @override
  String get reportSubtitle => 'Your report is confidential.';

  @override
  String get reasonSpam => 'Spam';

  @override
  String get reasonHarassment => 'Harassment';

  @override
  String get reasonNudity => 'Nudity / Sexual content';

  @override
  String get reasonViolence => 'Violence';

  @override
  String get reasonSelfHarm => 'Self-harm';

  @override
  String get reasonMisinformation => 'Misinformation';

  @override
  String get reasonScam => 'Scam / Fraud';

  @override
  String get reasonOther => 'Other';

  @override
  String get reportDetailsHint => 'Add details (optional)';

  @override
  String get reportSubmit => 'Submit report';

  @override
  String get reportThanksTitle => 'Thanks for letting us know';

  @override
  String get reportThanksBody =>
      'We\'ll review this against our Community Guidelines.';

  @override
  String get done => 'Done';

  @override
  String get timeNow => 'now';

  @override
  String timeMinutes(int n) {
    return '${n}m';
  }

  @override
  String timeHours(int n) {
    return '${n}h';
  }

  @override
  String timeDays(int n) {
    return '${n}d';
  }

  @override
  String timeWeeks(int n) {
    return '${n}w';
  }

  @override
  String get storyReplyHint => 'Send a message…';

  @override
  String get storyClose => 'Close story';

  @override
  String get storyDemoReaction => 'Reaction sent';

  @override
  String get promoteTitle => 'Promote your post';

  @override
  String get postScreenTitle => 'Post';

  @override
  String get exploreTitle => 'Explore';

  @override
  String get exploreSearchHint => 'Search people, places and hashtags';

  @override
  String get exploreClearSearch => 'Clear search';

  @override
  String exploreLocationNote(String place) {
    return 'Showing $place. District-level only, never your exact location.';
  }

  @override
  String exploreTrendingIn(String place) {
    return 'Trending in $place';
  }

  @override
  String exploreTrendPosts(String count) {
    return '$count posts';
  }

  @override
  String get exploreCategories => 'Categories';

  @override
  String get exploreAll => 'All';

  @override
  String get placeWorld => 'the world';

  @override
  String exploreNoResults(String query) {
    return 'No results for “$query”';
  }

  @override
  String get exploreNoResultsBody => 'Try a different name, place or hashtag.';

  @override
  String get exploreResultsPeople => 'People';

  @override
  String get exploreResultsHashtags => 'Hashtags';

  @override
  String get exploreResultsPosts => 'Posts';

  @override
  String get catNews => 'News';

  @override
  String get catEntertainment => 'Entertainment';

  @override
  String get catEducation => 'Education';

  @override
  String get catBusiness => 'Business';

  @override
  String get catFood => 'Food';

  @override
  String get catTravel => 'Travel';

  @override
  String get catTechnology => 'Technology';

  @override
  String get catSports => 'Sports';

  @override
  String get catAgriculture => 'Agriculture';

  @override
  String get catFashion => 'Fashion';

  @override
  String get catLocal => 'Local';

  @override
  String get catJobs => 'Jobs';

  @override
  String get catEvents => 'Events';

  @override
  String get reelMute => 'Mute';

  @override
  String get reelUnmute => 'Unmute';

  @override
  String get reelPlay => 'Play';

  @override
  String get reelPause => 'Pause';

  @override
  String reelMusic(String title) {
    return 'Music: $title';
  }

  @override
  String get reelCreate => 'Create a reel';

  @override
  String get actionFollow => 'Follow';

  @override
  String get actionFollowing => 'Following';

  @override
  String get actionMessage => 'Message';

  @override
  String get createTitle => 'Create';

  @override
  String get createOptionPost => 'Post';

  @override
  String get createOptionPostBody => 'Share a photo or a text update';

  @override
  String get createOptionReel => 'Reel';

  @override
  String get createOptionReelBody => 'A short vertical video';

  @override
  String get createOptionStory => 'Story';

  @override
  String get createOptionStoryBody => 'Disappears after 24 hours';

  @override
  String get createOptionLive => 'Go Live';

  @override
  String get createOptionLiveBody => 'For eligible creators';

  @override
  String get createPostTitle => 'New post';

  @override
  String get createReelTitle => 'New reel';

  @override
  String get createStoryTitle => 'New story';

  @override
  String get createTypePhoto => 'Photo';

  @override
  String get createTypeText => 'Text';

  @override
  String get createPickPhoto => 'Choose a photo';

  @override
  String get createPickVideo => 'Choose a video';

  @override
  String get createGalleryNote =>
      'Demo gallery — in the real app this opens your device gallery.';

  @override
  String get createCaptionLabel => 'Caption';

  @override
  String get createCaptionHint => 'What\'s happening in your block?';

  @override
  String get createHashtags => 'Suggested hashtags';

  @override
  String get createLocation => 'Location';

  @override
  String get createLocationNote =>
      'District-level only. Your exact location is never shared.';

  @override
  String get createChangeLocation => 'Change';

  @override
  String get createSearchDistrict => 'Search districts';

  @override
  String get createAudience => 'Audience';

  @override
  String get audienceEveryone => 'Everyone';

  @override
  String get audienceFollowers => 'Followers';

  @override
  String get audienceCloseFriends => 'Close friends';

  @override
  String get createPublish => 'Post';

  @override
  String get createPublishing => 'Posting…';

  @override
  String createPosted(String district) {
    return 'Your post is live in $district';
  }

  @override
  String get createReelPosted => 'Your reel is live';

  @override
  String get createStoryPosted => 'Added to your story';

  @override
  String get createErrorCaptionTooLong =>
      'Caption is too long (max 2,200 characters)';

  @override
  String get createErrorCaptionRequired => 'Write something to share';

  @override
  String get createErrorMediaRequired => 'Choose a photo or video first';

  @override
  String get createErrorTooManyHashtags => 'Too many hashtags (max 30)';

  @override
  String get createErrorLocationRequired => 'Choose a location';

  @override
  String createStartsAt(String level, String district) {
    return 'Starts at $level · $district';
  }

  @override
  String get createStartsBody =>
      'It climbs the Reach Ladder when people across districts engage.';

  @override
  String get createMusic => 'Music';

  @override
  String get createChooseMusic => 'Choose music';

  @override
  String get createCover => 'Cover';

  @override
  String get createStoryText => 'Add text to your story';

  @override
  String get createStoryShare => 'Share to story';

  @override
  String get createStoryTextHint => 'Say something…';

  @override
  String get liveTitle => 'Go Live';

  @override
  String get liveAccessTitle => 'LIVE ACCESS';

  @override
  String liveFollowersRule(int required) {
    final intl.NumberFormat requiredNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String requiredString = requiredNumberFormat.format(required);

    return 'Followers: $requiredString required';
  }

  @override
  String liveFollowersYours(int current) {
    final intl.NumberFormat currentNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String currentString = currentNumberFormat.format(current);

    return 'Your followers: $currentString';
  }

  @override
  String liveAgeRule(int required) {
    final intl.NumberFormat requiredNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String requiredString = requiredNumberFormat.format(required);

    return 'Account age: $requiredString days required';
  }

  @override
  String liveAgeYours(int current) {
    final intl.NumberFormat currentNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String currentString = currentNumberFormat.format(current);

    return 'Your account: $currentString days';
  }

  @override
  String get liveTrustRule => 'Trust status';

  @override
  String get liveTrustEligible => 'Eligible';

  @override
  String get liveTrustReview => 'Under review';

  @override
  String get liveTrustRestricted => 'Restricted';

  @override
  String get liveTwoFactorRule => 'Two-factor authentication';

  @override
  String get liveEnabled => 'Enabled';

  @override
  String get liveNotEnabled => 'Not enabled';

  @override
  String get liveViolationRule => 'No major violations';

  @override
  String get liveAgeRuleEligible => 'Age eligibility';

  @override
  String get liveMet => 'Met';

  @override
  String get liveNotMet => 'Not met';

  @override
  String get liveGranted => 'LIVE ACCESS GRANTED';

  @override
  String get liveGrantedBody =>
      'You meet every requirement. Live streaming is not available in this demo.';

  @override
  String get liveNotYet => 'Not eligible yet';

  @override
  String get liveNotYetBody =>
      'Complete the requirements below to unlock Live.';

  @override
  String get liveEnableTwoFactor => 'Turn on two-factor authentication';

  @override
  String get liveStart => 'Start live';

  @override
  String get liveRequirementMet => 'Requirement met';

  @override
  String get liveRequirementNotMet => 'Requirement not met';

  @override
  String get profilePosts => 'Posts';

  @override
  String get profileFollowers => 'Followers';

  @override
  String get profileFollowing => 'Following';

  @override
  String get profileTabPosts => 'Posts';

  @override
  String get profileTabReels => 'Reels';

  @override
  String get profileTabTagged => 'Tagged';

  @override
  String get profileReachLevel => 'Reach level';

  @override
  String profileLevelLine(String code, String level) {
    return '$code — $level';
  }

  @override
  String get profileShare => 'Share';

  @override
  String get profileMenu => 'Menu';

  @override
  String get profileCreatorStudio => 'Creator Studio';

  @override
  String get profileBusiness => 'Business profile';

  @override
  String get profileVerification => 'Verification';

  @override
  String get profileSafetyCenter => 'Safety Center';

  @override
  String get profileSettings => 'Settings';

  @override
  String get profileMessages => 'Messages';

  @override
  String get profileBestPost => 'Based on your best post';

  @override
  String get verifiedIdentity => 'Verified Identity';

  @override
  String get verifiedBusiness => 'Verified Business';

  @override
  String get verifiedCreator => 'Verified Creator';

  @override
  String get verifiedPublisher => 'Verified Publisher';

  @override
  String get backTooltip => 'Back';

  @override
  String get studioTitle => 'Creator Studio';

  @override
  String get studioSubtitle => 'Reach, growth and earnings at a glance';

  @override
  String get studioEstimatedEarnings => 'Estimated earnings';

  @override
  String get studioEarningsNote =>
      'Estimates come from qualified reach and can change after quality checks. Demo values, not a payout promise.';

  @override
  String get studioFollowers => 'Followers';

  @override
  String get studioQualifiedReach => 'Qualified reach';

  @override
  String get studioLast30 => 'Last 30 days';

  @override
  String studioLevelReach(String level) {
    return '$level reach';
  }

  @override
  String get studioReachPerformance => 'Reach performance';

  @override
  String get studioReachPerformanceBody =>
      'How much of your audience footprint each level covers.';

  @override
  String get studioNextMilestone => 'Next milestone';

  @override
  String studioMilestoneProgress(int percent) {
    return '$percent% complete';
  }

  @override
  String get studioMilestoneBody => 'Keep growing your cross-state audience.';

  @override
  String get studioMilestoneTop =>
      'You are at the top of the ladder. Keep the momentum going.';

  @override
  String get studioTopPosts => 'Top posts';

  @override
  String get studioOpenPost => 'Open post';

  @override
  String get businessLabel => 'BLOCKS Business';

  @override
  String get businessTabPosts => 'Posts';

  @override
  String get businessTabReels => 'Reels';

  @override
  String get businessTabOffers => 'Offers';

  @override
  String get businessTabAbout => 'About';

  @override
  String businessFollowers(String count) {
    return '$count followers';
  }

  @override
  String get businessContact => 'Contact';

  @override
  String get businessPromote => 'Promote';

  @override
  String get businessCall => 'Call';

  @override
  String get businessWhatsApp => 'WhatsApp';

  @override
  String get businessWebsite => 'Website';

  @override
  String businessCopied(String what) {
    return '$what copied';
  }

  @override
  String get businessHours => 'Opening hours';

  @override
  String get businessCategory => 'Category';

  @override
  String get businessLocation => 'Location';

  @override
  String businessOfferCode(String code) {
    return 'Code: $code';
  }

  @override
  String businessOfferValid(String date) {
    return 'Valid until $date';
  }

  @override
  String get businessCopyCode => 'Copy code';

  @override
  String get businessAbout => 'About';

  @override
  String promoteStepOf(int current, int total) {
    return 'Step $current of $total';
  }

  @override
  String get promoteStepPost => 'Select post';

  @override
  String get promoteStepGoal => 'Choose a goal';

  @override
  String get promoteStepAudience => 'Select audience';

  @override
  String get promoteStepLocation => 'Select location';

  @override
  String get promoteStepBudget => 'Set budget';

  @override
  String get promoteStepReview => 'Review';

  @override
  String get promoteStepPublish => 'Publish';

  @override
  String get goalFollowers => 'More followers';

  @override
  String get goalFollowersBody =>
      'Grow your audience with people likely to follow.';

  @override
  String get goalReach => 'More reach';

  @override
  String get goalReachBody => 'Show your post to as many people as possible.';

  @override
  String get goalWebsite => 'Website visits';

  @override
  String get goalWebsiteBody => 'Send people to your website.';

  @override
  String get goalContact => 'WhatsApp / Contact';

  @override
  String get goalContactBody => 'Get calls and WhatsApp messages.';

  @override
  String get goalVideoViews => 'Video views';

  @override
  String get goalVideoViewsBody => 'Get more people to watch your video.';

  @override
  String get promoteAudienceNote =>
      'We target interest groups. Personal details are never shared with advertisers.';

  @override
  String get promoteInterests => 'Interests';

  @override
  String get promoteLocationsHint =>
      'Where should your post be shown? Pick one or more districts.';

  @override
  String get promoteAddDistrict => 'Add district';

  @override
  String get promoteDailyBudget => 'Daily budget';

  @override
  String get promoteDuration => 'Duration';

  @override
  String promoteDays(int n) {
    return '$n days';
  }

  @override
  String get promoteTotal => 'Total budget';

  @override
  String get promoteEstimatedReach => 'Estimated reach';

  @override
  String promoteReachRange(String min, String max) {
    return '$min – $max people';
  }

  @override
  String get promoteDemoBanner => 'Demo campaign. No real money is processed.';

  @override
  String get promoteContinue => 'Continue';

  @override
  String get promoteBack => 'Back';

  @override
  String get promotePublish => 'Publish demo campaign';

  @override
  String get promoteSuccessTitle => 'Demo campaign created';

  @override
  String get promoteSuccessBody =>
      'In the real app your post would now start reaching new people. No money was charged.';

  @override
  String get promoteDone => 'Done';

  @override
  String get promoteReviewPost => 'Post';

  @override
  String get promoteReviewGoal => 'Goal';

  @override
  String get promoteReviewAudience => 'Audience';

  @override
  String get promoteReviewLocation => 'Locations';

  @override
  String get promoteReviewBudget => 'Budget';

  @override
  String get promoteNoPosts => 'Create a post first, then promote it.';

  @override
  String get campErrPost => 'Select a post to promote';

  @override
  String get campErrGoal => 'Choose a goal';

  @override
  String get campErrLocation => 'Pick at least one location';

  @override
  String get campErrBudgetLow => 'Minimum daily budget is ₹100';

  @override
  String get campErrBudgetHigh => 'Maximum daily budget is ₹50,000';

  @override
  String get campErrDuration => 'Duration must be 1 to 30 days';

  @override
  String get notifTitle => 'Notifications';

  @override
  String get notifMarkAllRead => 'Mark all as read';

  @override
  String get notifAllMarked => 'All notifications marked as read';

  @override
  String get notifAll => 'All';

  @override
  String get notifCatLikes => 'Likes';

  @override
  String get notifCatComments => 'Comments';

  @override
  String get notifCatFollowers => 'New followers';

  @override
  String get notifCatShares => 'Shares';

  @override
  String get notifCatReach => 'Reach levels';

  @override
  String get notifCatEarnings => 'Earnings';

  @override
  String get notifCatBusiness => 'Business';

  @override
  String get notifCatSafety => 'Safety';

  @override
  String get notifUnread => 'Unread';

  @override
  String get notifEmptyTitle => 'You\'re all caught up';

  @override
  String get notifEmptyBody => 'New activity will show up here.';

  @override
  String get messagesTitle => 'Messages';

  @override
  String get messagesSearchHint => 'Search conversations';

  @override
  String get messagesEmptyTitle => 'No conversations yet';

  @override
  String get messagesEmptyBody => 'Start one from someone\'s profile.';

  @override
  String messagesNoMatch(String query) {
    return 'No conversations match “$query”';
  }

  @override
  String get chatOnline => 'Online';

  @override
  String get chatOffline => 'Offline';

  @override
  String get chatMessageHint => 'Message…';

  @override
  String get chatSend => 'Send';

  @override
  String get chatAttach => 'Attach photo';

  @override
  String get chatVoice => 'Record voice message';

  @override
  String get chatPhoto => 'Photo';

  @override
  String chatVoiceMessage(String duration) {
    return 'Voice message, $duration';
  }

  @override
  String get chatUnavailableDemo => 'Not available in this demo';

  @override
  String get chatEmptyTitle => 'Say hello';

  @override
  String get chatEmptyBody => 'Messages you send will appear here.';

  @override
  String conversationUnread(String count) {
    return '$count unread';
  }

  @override
  String get verifyTitle => 'Verification';

  @override
  String get verifyStatusTitle => 'Verification status';

  @override
  String get verifyStatusNone => 'Not verified';

  @override
  String get verifyStatusPending => 'Pending review';

  @override
  String get verifyStatusVerified => 'Verified';

  @override
  String get verifyStatusRejected => 'Not approved';

  @override
  String get verifyIntro =>
      'Badges are earned, never bought. Each has clear eligibility rules and can be revoked.';

  @override
  String get verifyBodyIdentity =>
      'Confirms you are a real person using an approved ID check.';

  @override
  String get verifyBodyBusiness =>
      'Confirms a business or organisation is genuine.';

  @override
  String get verifyBodyCreator =>
      'Recognises sustained, original and compliant creators.';

  @override
  String get verifyBodyPublisher =>
      'For news and media organisations that cite sources and publish corrections.';

  @override
  String get verifyRequest => 'Request';

  @override
  String get verifyRequested => 'Requested';

  @override
  String get verifyCurrent => 'Current badge';

  @override
  String get verifySubmitted => 'Verification requested';

  @override
  String get verifyDemoAdminTitle => 'Demo admin';

  @override
  String get verifyDemoAdminBody =>
      'In the real app a trust team reviews your request. In this demo you can approve it yourself.';

  @override
  String get verifyApprove => 'Approve (demo)';

  @override
  String get verifyApproved => 'You\'re verified';

  @override
  String get safetyTitle => 'Safety Center';

  @override
  String get safetyIntro =>
      'Tools to control who can reach you and what you see.';

  @override
  String get safetySectionReport => 'Report';

  @override
  String get safetyReportContent => 'Report content or a problem';

  @override
  String get safetyReportContentBody =>
      'You can also tap the three dots on any post, reel or profile.';

  @override
  String get safetySectionPeople => 'People';

  @override
  String get safetyBlocked => 'Blocked accounts';

  @override
  String get safetyMuted => 'Muted accounts';

  @override
  String get safetyRestricted => 'Restricted accounts';

  @override
  String get safetyRestrictedBody =>
      'Restricted people can\'t see when you are active. Restrict someone from their profile menu.';

  @override
  String get safetySectionControls => 'Controls';

  @override
  String get safetySensitive => 'Sensitive content';

  @override
  String get safetySensitiveBody =>
      'Choose how much sensitive content appears in your feeds.';

  @override
  String get safetySensitiveLess => 'Less';

  @override
  String get safetySensitiveStandard => 'Standard';

  @override
  String get safetySensitiveMore => 'More';

  @override
  String get safetyComments => 'Who can comment';

  @override
  String get safetyMessages => 'Who can message you';

  @override
  String get safetyEveryone => 'Everyone';

  @override
  String get safetyFollowers => 'Followers';

  @override
  String get safetyNobody => 'No one';

  @override
  String get safetyPrivateAccount => 'Private account';

  @override
  String get safetyPrivateAccountBody =>
      'Only approved followers can see your posts.';

  @override
  String get safetySectionSecurity => 'Security';

  @override
  String get safetyTwoFactor => 'Two-factor authentication';

  @override
  String get safetyTwoFactorBody =>
      'Adds a second step when you sign in. Required for Live.';

  @override
  String get safetyLoginSecurity => 'Login security';

  @override
  String safetyLoginBody(String place) {
    return 'This device · $place · active now';
  }

  @override
  String get safetyLoginAlerts => 'Alert me about new sign-ins';

  @override
  String get blockedTitle => 'Blocked accounts';

  @override
  String get mutedTitle => 'Muted accounts';

  @override
  String get blockedEmptyBody => 'People you block can\'t find your profile.';

  @override
  String get mutedEmptyBody =>
      'Muted people\'s posts are hidden from your feeds.';

  @override
  String get unblock => 'Unblock';

  @override
  String get unmute => 'Unmute';

  @override
  String unblockedToast(String username) {
    return '$username unblocked';
  }

  @override
  String unmutedToast(String username) {
    return '$username unmuted';
  }

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsSectionAccount => 'Account';

  @override
  String get settingsSectionPreferences => 'Preferences';

  @override
  String get settingsSectionSupport => 'Support';

  @override
  String get settingsAppearance => 'Appearance';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Light';

  @override
  String get themeDark => 'Dark';

  @override
  String get settingsAccount => 'Account details';

  @override
  String get settingsPrivacy => 'Privacy';

  @override
  String get settingsSecurity => 'Security';

  @override
  String get settingsNotifications => 'Notifications';

  @override
  String get settingsLanguage => 'Language';

  @override
  String get settingsLanguageSystem => 'System default';

  @override
  String get settingsContent => 'Content preferences';

  @override
  String get settingsCreator => 'Creator settings';

  @override
  String get settingsBusiness => 'Business settings';

  @override
  String get settingsHelp => 'Help & support';

  @override
  String get settingsGuidelines => 'Community guidelines';

  @override
  String get settingsPrivacyPolicy => 'Privacy policy';

  @override
  String get settingsTerms => 'Terms of service';

  @override
  String get settingsLogout => 'Log out';

  @override
  String get settingsLogoutTitle => 'Log out of BLOCKS?';

  @override
  String get settingsLogoutBody =>
      'You can sign back in as the demo user any time.';

  @override
  String get settingsDemoMode =>
      'Demo mode · all data is generated on this device';

  @override
  String get settingsAccountName => 'Name';

  @override
  String get settingsAccountUsername => 'Username';

  @override
  String get settingsAccountLocation => 'Location';

  @override
  String get settingsAccountAge => 'Time on BLOCKS';

  @override
  String settingsAccountDays(String days) {
    return '$days days';
  }

  @override
  String get prefNotifLikes => 'Likes';

  @override
  String get prefNotifComments => 'Comments';

  @override
  String get prefNotifFollowers => 'New followers';

  @override
  String get prefNotifReach => 'Reach level unlocks';

  @override
  String get prefNotifEarnings => 'Creator earnings';

  @override
  String get prefNotifBusiness => 'Business activity';

  @override
  String get prefNotifSafety => 'Safety and security';

  @override
  String get prefAlwaysOn => 'Always on';

  @override
  String get prefAutoplay => 'Autoplay videos';

  @override
  String get prefDataSaver => 'Data saver';

  @override
  String get prefDataSaverBody => 'Loads smaller images and limits preloading.';

  @override
  String get prefShowReachBadge => 'Show Reach Level on my profile';

  @override
  String get prefCreatorEarnings => 'Show earnings in Creator Studio';

  @override
  String get prefWeeklySummary => 'Weekly performance summary';

  @override
  String get prefBusinessAutoReply => 'Auto-reply to messages';

  @override
  String get prefBusinessContact => 'Show Contact button';

  @override
  String get prefOpenBusiness => 'Open business profile';

  @override
  String get infoGuidelinesTitle => 'Community guidelines';

  @override
  String get infoGuidelinesBody =>
      '# Be real\nShare your own work and say when content is AI-generated or taken from a source.\n\n# Be kind\nNo harassment, hate or threats. Disagree without attacking people.\n\n# Keep it safe\nNo sexual exploitation, graphic violence, self-harm promotion, scams or illegal goods. Content involving minors is removed immediately.\n\n# Earn reach fairly\nFake engagement, bots and view manipulation are not allowed. Reach Levels count qualified viewers only.\n\n# Appeals\nIf we remove something you can appeal and a person will review it.';

  @override
  String get infoPrivacyTitle => 'Privacy policy';

  @override
  String get infoPrivacyBody =>
      '# What we collect\nOnly what BLOCKS needs: your profile, your posts and your district — never your exact GPS location.\n\n# What we never do\nWe do not sell your personal data. Advertisers reach interest groups, not individuals.\n\n# Your controls\nUse Safety Center and Settings to control privacy, messages and notifications. You can request your data or delete your account.\n\n# Payments and identity\nPayout and identity details are stored separately from your public profile.\n\n# Demo note\nThis is summary copy for the prototype, not a legal policy.';

  @override
  String get infoTermsTitle => 'Terms of service';

  @override
  String get infoTermsBody =>
      '# Using BLOCKS\nYou must be old enough to use social media in your country and follow the Community Guidelines.\n\n# Your content\nYou own what you post and let BLOCKS show it to other people.\n\n# Creator rewards\nRewards come from a pool shared by qualified reach. They are estimates until finalised and are never a promise of a rupee amount per view.\n\n# Demo note\nThis is summary copy for the prototype, not legal terms.';

  @override
  String get infoHelpTitle => 'Help & support';

  @override
  String get infoHelpBody =>
      '# How do Reach Levels work?\nPosts climb District, State, National and Global as real people in more places engage with them.\n\n# Why is my post still at District level?\nOnly qualified views count. Open the Rising tab to see how close it is.\n\n# How do I get verified?\nOpen Profile, then Menu, then Verification and request a badge.\n\n# How do I report something?\nTap the three dots on a post, reel or profile and choose Report.\n\n# Need a person?\nThis is a demo, so there is no live support.';

  @override
  String get reelsTabForYou => 'For You';

  @override
  String get reelsTabFollowing => 'Following';

  @override
  String get reelsFollowingEmptyTitle => 'No reels from people you follow yet';

  @override
  String get reelsFollowingEmptyBody =>
      'Follow creators to see their reels here.';

  @override
  String get reelsFeedSemantics => 'Reels feed';

  @override
  String get prefReelsSound => 'Reels sound';

  @override
  String get prefReelsSoundBody => 'Reels always start muted in a new session.';

  @override
  String get secAlertEmail => 'Security alerts by email';

  @override
  String get secAlertPush => 'Security alerts on my devices';

  @override
  String get secAlertNewDevice => 'New device sign-in alerts';

  @override
  String get notifCatSecurity => 'Security';

  @override
  String get secTitle => 'Security';

  @override
  String get secStatusProtected => 'Your account is protected';

  @override
  String get secStatusAttention => 'Your account needs attention';

  @override
  String get secStatusBody2faOn =>
      'Two-factor authentication is on and nothing unusual was found.';

  @override
  String get secStatusBody2faOff =>
      'Turn on two-factor authentication to protect your account.';

  @override
  String get secStatusBodySuspicious =>
      'We found a suspicious sign-in. Review it now.';

  @override
  String secLastSignIn(String when) {
    return 'Last sign-in: $when';
  }

  @override
  String get secSectionAccount => 'Account security';

  @override
  String get secSectionDemo => 'Demo';

  @override
  String get secChangePassword => 'Change Password';

  @override
  String get secChangeEmail => 'Change Email';

  @override
  String get secChangePhone => 'Change Phone Number';

  @override
  String get secTwoFactor => 'Two-Factor Authentication';

  @override
  String get secLoginActivity => 'Login Activity';

  @override
  String get secDevices => 'Logged-in Devices';

  @override
  String get secLogoutOthers => 'Log Out From All Other Devices';

  @override
  String get secNotifications => 'Security Notifications';

  @override
  String get secOn => 'On';

  @override
  String get secOff => 'Off';

  @override
  String secDevicesCount(int n) {
    return '$n devices';
  }

  @override
  String get secLogoutOthersTitle => 'Log out of all other devices?';

  @override
  String get secLogoutOthersBody =>
      'This will end BLOCKS sessions on every device except this one.';

  @override
  String get secLogoutOthersConfirm => 'Log Out Others';

  @override
  String get secLogoutOthersDone => 'Logged out of all other devices';

  @override
  String get secDemoLab => 'Security demo lab';

  @override
  String get secDemoLabBody =>
      'Simulate sign-in attacks, alerts and device changes.';

  @override
  String get secReviewNeeded => 'Review';

  @override
  String get secFieldRequired => 'This field is required';

  @override
  String get secPasswordLabel => 'Password';

  @override
  String get cpTitle => 'Change Password';

  @override
  String get cpIntro =>
      'Choose a strong password you don\'t use anywhere else.';

  @override
  String get cpCurrent => 'Current password';

  @override
  String get cpNew => 'New password';

  @override
  String get cpConfirm => 'Confirm new password';

  @override
  String get cpShow => 'Show password';

  @override
  String get cpHide => 'Hide password';

  @override
  String get cpStrength => 'Password strength';

  @override
  String get cpStrengthWeak => 'Weak';

  @override
  String get cpStrengthFair => 'Fair';

  @override
  String get cpStrengthStrong => 'Strong';

  @override
  String get cpStrengthVeryStrong => 'Very strong';

  @override
  String cpRuleMinLength(int n) {
    return 'At least $n characters';
  }

  @override
  String get cpRuleUpper => 'An uppercase letter (A-Z)';

  @override
  String get cpRuleLower => 'A lowercase letter (a-z)';

  @override
  String get cpRuleDigit => 'A number (0-9)';

  @override
  String get cpRuleSpecial => 'A special character (! @ # ...)';

  @override
  String get cpMismatch => 'Passwords don\'t match';

  @override
  String get cpSubmit => 'Change Password';

  @override
  String get cpForgot => 'Forgot your current password?';

  @override
  String get cpSuccessTitle => 'Password Changed';

  @override
  String get cpSuccessBody =>
      'Your BLOCKS password has been updated successfully.';

  @override
  String get cpErrorTitle => 'Unable to change password.';

  @override
  String get cpErrorBody =>
      'Please verify your current password and try again.';

  @override
  String get cpErrWeak => 'The new password doesn\'t meet the requirements.';

  @override
  String get cpErrSame =>
      'Your new password must be different from the current one.';

  @override
  String get devTitle => 'Your Devices';

  @override
  String get devActiveNow => 'Active now';

  @override
  String get devCurrentBadge => 'This device';

  @override
  String get devLogOut => 'Log Out';

  @override
  String get devLogOutTitle => 'Log out of this device?';

  @override
  String devLogOutBody(String device) {
    return '$device will be signed out of BLOCKS.';
  }

  @override
  String get devLoggedOut => 'Device logged out';

  @override
  String get devEmpty => 'No other devices are signed in.';

  @override
  String devOnPlatform(String app, String platform) {
    return '$app on $platform';
  }

  @override
  String get actTitle => 'Login Activity';

  @override
  String get actFilterAll => 'All';

  @override
  String get actFilterSuccessful => 'Successful';

  @override
  String get actFilterFailed => 'Failed';

  @override
  String get actFilterSuspicious => 'Suspicious';

  @override
  String get actToday => 'Today';

  @override
  String get actYesterday => 'Yesterday';

  @override
  String get actEmptyTitle => 'No activity to show';

  @override
  String get actEmptyBody => 'Nothing matches this filter.';

  @override
  String get evLoginSuccess => 'Successful Login';

  @override
  String get evLoginFailed => 'Failed Login Attempt';

  @override
  String get evSuspicious => 'Suspicious Login Attempt';

  @override
  String get evPasswordChanged => 'Password Changed';

  @override
  String get evEmailChanged => 'Email Changed';

  @override
  String get evPhoneChanged => 'Phone Number Changed';

  @override
  String get evTwoFactorOn => 'Two-Factor Authentication Enabled';

  @override
  String get evTwoFactorOff => 'Two-Factor Authentication Disabled';

  @override
  String get evSessionRevoked => 'Device Logged Out';

  @override
  String evAttempts(int n) {
    return '$n failed attempts';
  }

  @override
  String get evReviewed => 'Reviewed';

  @override
  String get tfTitle => 'Two-Factor Authentication';

  @override
  String get tfIntro =>
      'Add a second step when you sign in, so a stolen password isn\'t enough.';

  @override
  String get tfStatusOn => 'Two-factor authentication is on';

  @override
  String get tfStatusOff => 'Two-factor authentication is off';

  @override
  String get tfMethod => 'Verification method';

  @override
  String get tfSms => 'Text message (SMS)';

  @override
  String tfSmsBody(String phone) {
    return 'Codes are sent to $phone';
  }

  @override
  String get tfAuthenticator => 'Authenticator app';

  @override
  String get tfAuthenticatorBody =>
      'Use an app like Google Authenticator or Authy.';

  @override
  String get tfEmailFallback => 'Email fallback';

  @override
  String get tfEmailFallbackBody =>
      'If you can\'t get a code, we can send one to your email.';

  @override
  String get tfEnable => 'Turn on';

  @override
  String get tfDisable => 'Turn off';

  @override
  String get tfChooseMethod => 'Choose how to get codes';

  @override
  String tfCodeSentTo(String dest) {
    return 'We sent a code to $dest.';
  }

  @override
  String get tfAuthSetup =>
      'Open your authenticator app and enter the code shown for BLOCKS.';

  @override
  String get tfVerify => 'Verify and turn on';

  @override
  String get tfEnabledToast => 'Two-factor authentication is on';

  @override
  String get tfDisableTitle => 'Turn off two-factor authentication?';

  @override
  String get tfDisableBody =>
      'Your account will only be protected by your password. Enter it to confirm.';

  @override
  String get tfDisabledToast => 'Two-factor authentication is off';

  @override
  String get tfDemoNote => 'Demo: no real SMS or authenticator app is used.';

  @override
  String get otpEnterCode => 'Verification code';

  @override
  String otpLabel(int n) {
    return '$n-digit code';
  }

  @override
  String otpDemoHint(String code) {
    return 'Demo OTP: $code';
  }

  @override
  String get otpDemoNotice =>
      'Demo only. A real build never shows the code on screen.';

  @override
  String get otpResend => 'Resend code';

  @override
  String otpResendIn(int seconds) {
    return 'Resend in ${seconds}s';
  }

  @override
  String get otpResent => 'A new code was sent';

  @override
  String otpIncorrect(int attempts) {
    return 'That code isn\'t right. $attempts attempts left.';
  }

  @override
  String get otpExpired => 'This code has expired. Request a new one.';

  @override
  String otpLocked(String time) {
    return 'Too many wrong codes. Try again after $time.';
  }

  @override
  String get snTitle => 'Security Notifications';

  @override
  String get snIntro => 'Choose how BLOCKS alerts you about account activity.';

  @override
  String get snCritical => 'Suspicious sign-ins and account changes';

  @override
  String get snCriticalBody =>
      'Always on. We always alert you when a sign-in looks suspicious or your password, email or phone changes.';

  @override
  String get snSentTitle => 'Alerts sent to your email';

  @override
  String get snSentEmpty => 'No security emails have been sent yet.';

  @override
  String snSentTo(String email) {
    return 'Sent to $email';
  }

  @override
  String get snDemoNote => 'Demo: emails are simulated and only listed here.';

  @override
  String get alertSuspiciousTitle => 'Suspicious Login Attempt';

  @override
  String get alertSuspiciousBody =>
      'We detected multiple unsuccessful login attempts on your BLOCKS account.';

  @override
  String get alertNewDeviceTitle => 'New Device Sign-in';

  @override
  String get alertNewDeviceBody =>
      'A new device signed in to your BLOCKS account.';

  @override
  String get alertDevice => 'Device';

  @override
  String get alertLocation => 'Approximate location';

  @override
  String get alertTime => 'Time';

  @override
  String get alertIfYou => 'If this was you';

  @override
  String get alertIfYouBody => 'You don\'t need to do anything.';

  @override
  String get alertIfNotYou => 'If this wasn\'t you';

  @override
  String get alertIfNotYouBody =>
      'Change your password and review your logged-in devices.';

  @override
  String get alertSecure => 'Secure Account';

  @override
  String get alertReview => 'Review Devices';

  @override
  String get alertWasMe => 'This Was Me';

  @override
  String get alertAcknowledged => 'Thanks. We\'ve marked this as you.';

  @override
  String get alertSent => 'Security Alert Sent';

  @override
  String get alertSentBody =>
      'We\'ve sent a security notification to your registered email and active BLOCKS devices.';

  @override
  String get alertPrivacyNote =>
      'For your privacy we only show an approximate location.';

  @override
  String get cpRuleMet => 'met';

  @override
  String get cpRuleNotMet => 'not met yet';

  @override
  String get otpDemoFill => 'Tap to fill the code.';

  @override
  String get tfWrongPassword => 'That password isn\'t right.';

  @override
  String get authSignInPassword => 'Sign in with password';

  @override
  String get siTitle => 'Welcome back';

  @override
  String get siSubtitle => 'Sign in to your BLOCKS account.';

  @override
  String get siIdentifier => 'Email, phone or username';

  @override
  String get siButton => 'Sign In';

  @override
  String get siForgot => 'Forgot password?';

  @override
  String get siInvalid => 'Incorrect email, phone or password.';

  @override
  String siAttemptsLeft(int n) {
    return '$n attempts left before your account is temporarily protected.';
  }

  @override
  String get siProtectedTitle => 'Account temporarily protected';

  @override
  String siProtectedAttempts(int n) {
    return '$n failed login attempts detected.';
  }

  @override
  String get siProtectedBody => 'Your account has been temporarily protected.';

  @override
  String get siProtectedAdvice =>
      'If this wasn\'t you, secure your account immediately.';

  @override
  String siProtectedUntil(String time) {
    return 'You can try again after $time.';
  }

  @override
  String get siResetPassword => 'Reset password';

  @override
  String get siDemoCard => 'Demo account';

  @override
  String siDemoPassword(String password) {
    return 'Password: $password';
  }

  @override
  String get siDemoFill => 'Tap to fill in the demo sign-in.';

  @override
  String get labIntro =>
      'Run security scenarios on the demo server to show alerts, protection and device changes. Nothing here exists in a real build.';

  @override
  String get labStatus => 'What the server sees';

  @override
  String labFailed(int n, int total) {
    return 'Failed sign-ins: $n of $total';
  }

  @override
  String get labNotProtected => 'Sign-in is not restricted';

  @override
  String labProtectedUntil(String time) {
    return 'Sign-in is protected until $time';
  }

  @override
  String labEmails(int n) {
    return 'Security emails sent: $n';
  }

  @override
  String labDevices(int n) {
    return 'Active devices: $n';
  }

  @override
  String get labPhotoArmed => 'The next profile photo upload will fail';

  @override
  String get labRun => 'Run';

  @override
  String get labReset => 'Reset demo data';

  @override
  String get labResetDone => 'Demo security data reset';

  @override
  String get labOpenAlert => 'Open the alert';

  @override
  String get labTrySignIn => 'Sign out and try the sign-in screen';

  @override
  String get labNormalTitle => 'Normal login';

  @override
  String get labNormalBody =>
      'A successful sign-in from this device. No alert.';

  @override
  String get labWrongTitle => 'Wrong password';

  @override
  String get labWrongBody =>
      'One failed sign-in. Repeat it to watch the attempt counter.';

  @override
  String get labMaxTitle => 'Maximum failed attempts';

  @override
  String get labMaxBody =>
      'Reaches the limit: protection starts, and an event, notification and email are created.';

  @override
  String get labSuspiciousTitle => 'Suspicious login notification';

  @override
  String get labSuspiciousBody =>
      'A sign-in attempt from an unknown device raises the alert.';

  @override
  String get labPasswordTitle => 'Password changed';

  @override
  String get labPasswordBody =>
      'Records the change and sends the alert (your password stays the same).';

  @override
  String get labNewDeviceTitle => 'New device login';

  @override
  String get labNewDeviceBody =>
      'A new phone appears in your devices with a New Login alert.';

  @override
  String get labRevokedTitle => 'Session revoked';

  @override
  String get labRevokedBody =>
      'Another device is logged out, with a Device Removed alert.';

  @override
  String get labPhotoTitle => 'Photo upload fails';

  @override
  String get labPhotoBody =>
      'The next profile photo upload fails so you can see the error and retry.';

  @override
  String get fpTitle => 'Forgot Password';

  @override
  String fpStep(int current, int total) {
    return 'Step $current of $total';
  }

  @override
  String get fpChooseTitle => 'How should we verify you?';

  @override
  String get fpChooseBody =>
      'Pick where we should send your verification code.';

  @override
  String get fpViaEmail => 'Reset password using Email';

  @override
  String get fpViaPhone => 'Reset password using Phone';

  @override
  String get fpEmailBody => 'We\'ll send a verification code to your email.';

  @override
  String get fpPhoneBody => 'We\'ll text a verification code to your phone.';

  @override
  String get fpEmailLabel => 'Email address';

  @override
  String get fpPhoneLabel => 'Phone number';

  @override
  String get fpSendCode => 'Send Verification Code';

  @override
  String get fpSendOtp => 'Send OTP';

  @override
  String get fpVerifyCode => 'Verify Code';

  @override
  String get fpNewTitle => 'Create a new password';

  @override
  String get fpNewBody => 'Choose a strong password you haven\'t used before.';

  @override
  String get fpSave => 'Reset Password';

  @override
  String get fpDoneTitle => 'Password Changed Successfully';

  @override
  String get fpDoneBody => 'You can now sign in with your new password.';

  @override
  String get fpDoneBodyInApp =>
      'Your password is updated and your other devices were signed out for your safety.';

  @override
  String get fpBackToSignIn => 'Back to sign in';

  @override
  String get fpErrEmail => 'Enter a valid email address.';

  @override
  String get fpErrPhone => 'Enter a valid 10-digit mobile number.';

  @override
  String get fpTooMany => 'Too many attempts. Please try again later.';

  @override
  String get fpExpired => 'This verification expired. Please start again.';

  @override
  String get fpDemoAny => 'Demo: any valid email or phone number works.';

  @override
  String get ccCurrentEmail => 'Current email';

  @override
  String get ccCurrentPhone => 'Current phone number';

  @override
  String get ccNewEmail => 'New email address';

  @override
  String get ccNewPhone => 'New phone number';

  @override
  String get ccPasswordHint =>
      'For your security, enter your password to continue.';

  @override
  String get ccSendCode => 'Send Verification Code';

  @override
  String get ccConfirmTitle => 'Confirm the change';

  @override
  String ccConfirmBodyEmail(String value) {
    return 'Your BLOCKS email will change to $value.';
  }

  @override
  String ccConfirmBodyPhone(String value) {
    return 'Your BLOCKS phone number will change to $value.';
  }

  @override
  String get ccConfirm => 'Confirm';

  @override
  String get ccDoneEmailTitle => 'Email Updated';

  @override
  String get ccDoneEmailBody =>
      'We sent an alert to your previous address so you know it was you.';

  @override
  String get ccDonePhoneTitle => 'Phone Number Updated';

  @override
  String get ccDonePhoneBody => 'Your new number is now on your account.';

  @override
  String get ccErrSameEmail => 'That is already your current email.';

  @override
  String get ccErrSamePhone => 'That is already your current phone number.';

  @override
  String get epTitle => 'Edit Profile';

  @override
  String get epSave => 'Save';

  @override
  String get epSaveChanges => 'Save changes';

  @override
  String get epSaved => 'Profile updated';

  @override
  String get epPublicSection => 'Public profile';

  @override
  String get epPublicHint => 'Anyone on BLOCKS can see this.';

  @override
  String get epPrivateSection => 'Private details';

  @override
  String get epPrivateHint => 'Only you can see this.';

  @override
  String get epName => 'Full name';

  @override
  String get epUsername => 'Username';

  @override
  String get epBio => 'Bio';

  @override
  String epBioCount(int n, int total) {
    return '$n/$total';
  }

  @override
  String get epWebsite => 'Website';

  @override
  String get epLocation => 'Location';

  @override
  String get epCountry => 'Country';

  @override
  String get epState => 'State';

  @override
  String get epDistrict => 'District';

  @override
  String get epDob => 'Date of birth';

  @override
  String get epDobHint => 'Select your date of birth';

  @override
  String get epGender => 'Gender';

  @override
  String get epGenderFemale => 'Female';

  @override
  String get epGenderMale => 'Male';

  @override
  String get epGenderNonBinary => 'Non-binary';

  @override
  String get epGenderPrefer => 'Prefer not to say';

  @override
  String get epLanguage => 'Language';

  @override
  String get epLanguageHint => 'Applies to the whole app straight away.';

  @override
  String get epUsernameChecking => 'Checking availability...';

  @override
  String get epUsernameAvailable => 'This username is available';

  @override
  String epErrNameShort(int n) {
    return 'Enter at least $n characters.';
  }

  @override
  String epErrNameLong(int n) {
    return 'Use $n characters or fewer.';
  }

  @override
  String epErrUsernameShort(int n) {
    return 'Use at least $n characters.';
  }

  @override
  String epErrUsernameLong(int n) {
    return 'Use $n characters or fewer.';
  }

  @override
  String get epErrUsernameChars =>
      'Use only letters, numbers, dots and underscores. It can\'t start or end with a dot.';

  @override
  String get epErrUsernameReserved => 'That username isn\'t available.';

  @override
  String get epErrUsernameTaken => 'That username is already taken.';

  @override
  String epErrBioLong(int n) {
    return 'Keep your bio under $n characters.';
  }

  @override
  String get epErrWebsite => 'Enter a valid website, for example example.com.';

  @override
  String get epErrDobFuture => 'Your date of birth can\'t be in the future.';

  @override
  String epErrDobAge(int n) {
    return 'You must be at least $n years old.';
  }

  @override
  String get epErrDobInvalid => 'Enter a valid date of birth.';

  @override
  String get epDiscard => 'Discard changes?';

  @override
  String get epDiscardBody => 'Your edits will be lost.';

  @override
  String get epDiscardConfirm => 'Discard';

  @override
  String get epKeepEditing => 'Keep editing';

  @override
  String get phTitle => 'Change Profile Photo';

  @override
  String get phTake => 'Take Photo';

  @override
  String get phChoose => 'Choose from Gallery';

  @override
  String get phRemove => 'Remove Photo';

  @override
  String get phRemoveTitle => 'Remove your photo?';

  @override
  String get phRemoveBody => 'Your profile will show your initials instead.';

  @override
  String get phEditSemantics => 'Change profile photo';

  @override
  String phUploading(int percent) {
    return 'Uploading photo... $percent%';
  }

  @override
  String get phDone => 'Profile photo updated';

  @override
  String get phRemoved => 'Profile photo removed';

  @override
  String get phErrUnsupported => 'Use a JPG, PNG or WebP photo.';

  @override
  String phErrTooLarge(int n) {
    return 'That photo is too large. Choose one under $n MB.';
  }

  @override
  String get phErrNetwork =>
      'Couldn\'t upload the photo. Check your connection and try again.';

  @override
  String get phErrPick => 'Couldn\'t open your camera or gallery.';

  @override
  String get settingsEmail => 'Email';

  @override
  String get settingsPhone => 'Phone';

  @override
  String get settingsPassword => 'Password';

  @override
  String get settingsSectionPrivacySafety => 'Privacy & safety';

  @override
  String get secOverview => 'Security overview';

  @override
  String reelVideoSemantics(String name) {
    return 'Reel by $name. Tap to play or pause, double tap to like.';
  }

  @override
  String get audiencePrivate => 'Private';

  @override
  String get evPayoutAccountChanged => 'Payout account changed';

  @override
  String get evIdentityChanged => 'Identity details submitted';

  @override
  String get rsToolClips => 'Clips';

  @override
  String get rsToolTrim => 'Trim';

  @override
  String get rsToolMusic => 'Music';

  @override
  String get rsToolText => 'Text';

  @override
  String get rsToolStickers => 'Stickers';

  @override
  String get rsToolFilters => 'Filters';

  @override
  String get rsToolAdjust => 'Adjust';

  @override
  String get rsToolTransitions => 'Transitions';

  @override
  String get rsToolCover => 'Cover';

  @override
  String get fltOriginal => 'Original';

  @override
  String get fltVivid => 'Vivid';

  @override
  String get fltWarm => 'Warm';

  @override
  String get fltCool => 'Cool';

  @override
  String get fltCinematic => 'Cinematic';

  @override
  String get fltPortrait => 'Portrait';

  @override
  String get fltVintage => 'Vintage';

  @override
  String get fltBw => 'Black & White';

  @override
  String get fltGolden => 'Golden Hour';

  @override
  String get fltIndia => 'India';

  @override
  String get fltUrban => 'Urban';

  @override
  String get fltFood => 'Foodie';

  @override
  String get fltTravel => 'Travel';

  @override
  String get fltNight => 'Night';

  @override
  String get trNone => 'None';

  @override
  String get trFade => 'Fade';

  @override
  String get trSlide => 'Slide';

  @override
  String get trZoom => 'Zoom';

  @override
  String get trWipe => 'Wipe';

  @override
  String get stkEmoji => 'Emoji';

  @override
  String get stkIndia => 'India';

  @override
  String get stkTravel => 'Travel';

  @override
  String get stkFood => 'Food';

  @override
  String get stkBusiness => 'Business';

  @override
  String get stkLove => 'Love';

  @override
  String get stkFunny => 'Funny';

  @override
  String get stkFestival => 'Festival';

  @override
  String get stkSports => 'Sports';

  @override
  String get stkCelebration => 'Celebration';

  @override
  String get fontClean => 'Clean';

  @override
  String get fontSerif => 'Serif';

  @override
  String get fontMono => 'Mono';

  @override
  String get fontDisplay => 'Display';

  @override
  String get fontScript => 'Script';

  @override
  String get anNone => 'None';

  @override
  String get anFade => 'Fade';

  @override
  String get anPop => 'Pop';

  @override
  String get anSlideUp => 'Slide up';

  @override
  String get anTypewriter => 'Typewriter';

  @override
  String get adjBrightness => 'Brightness';

  @override
  String get adjContrast => 'Contrast';

  @override
  String get adjSaturation => 'Saturation';

  @override
  String get adjWarmth => 'Warmth';

  @override
  String get adjHighlights => 'Highlights';

  @override
  String get adjShadows => 'Shadows';

  @override
  String get adjSharpness => 'Sharpness';

  @override
  String get adjFade => 'Fade';

  @override
  String get adjVignette => 'Vignette';

  @override
  String get musTrending => 'Trending';

  @override
  String get musPopular => 'Popular';

  @override
  String get musNew => 'New releases';

  @override
  String get musHindi => 'Hindi';

  @override
  String get musTelugu => 'Telugu';

  @override
  String get musTamil => 'Tamil';

  @override
  String get musBengali => 'Bengali';

  @override
  String get musMarathi => 'Marathi';

  @override
  String get musPunjabi => 'Punjabi';

  @override
  String get musKannada => 'Kannada';

  @override
  String get musMalayalam => 'Malayalam';

  @override
  String get musInstrumental => 'Instrumental';

  @override
  String get musDevotional => 'Devotional';

  @override
  String get musTravel => 'Travel';

  @override
  String get musFitness => 'Fitness';

  @override
  String get musRomantic => 'Romantic';

  @override
  String get musComedy => 'Comedy';

  @override
  String get rightsPlatform => 'BLOCKS Library';

  @override
  String get rightsLicensed => 'Licensed';

  @override
  String get rightsCreator => 'Creator-owned';

  @override
  String get rightsFree => 'Royalty-free';

  @override
  String get rightsRestricted => 'Restricted';

  @override
  String get qualDataSaver => 'Data Saver';

  @override
  String get qualBalanced => 'Balanced';

  @override
  String get qualHigh => 'High';

  @override
  String get qualOriginal => 'Original';

  @override
  String get qualDataSaverHint =>
      'Smallest upload. Good for slow or costly data.';

  @override
  String get qualBalancedHint =>
      'Recommended. Sharp picture with a smaller file.';

  @override
  String get qualHighHint => 'Sharper detail at a higher bitrate.';

  @override
  String get qualOriginalHint =>
      'No compression. Largest and slowest to upload.';

  @override
  String get pubPreparing => 'Preparing';

  @override
  String get pubCompressing => 'Compressing';

  @override
  String get pubProcessing => 'Processing';

  @override
  String get pubUploading => 'Uploading';

  @override
  String get pubServer => 'Processing on server';

  @override
  String get pubModeration => 'Moderation';

  @override
  String get pubPublished => 'Published';

  @override
  String get pubFailed => 'Failed';

  @override
  String get pubTitle => 'Publishing';

  @override
  String get pubKeepOpen =>
      'Please keep BLOCKS open until your reel is published.';

  @override
  String pubFileOf(int current, int total) {
    return 'File $current of $total';
  }

  @override
  String pubBytesOf(String sent, String size) {
    return '$sent of $size uploaded';
  }

  @override
  String get pubServerBody =>
      'BLOCKS is preparing your reel for every screen size.';

  @override
  String get pubModerationBody =>
      'Checking safety, copyright and community rules.';

  @override
  String get pubCheckSafety => 'Safety check';

  @override
  String get pubCheckCopyright => 'Copyright check';

  @override
  String get pubCheckPolicy => 'Policy check';

  @override
  String get pubDone => 'done';

  @override
  String get pubInProgress => 'in progress';

  @override
  String get pubWaiting => 'waiting';

  @override
  String get pubPublishedTitle => 'Reel Published ✓';

  @override
  String pubPublishedBody(String district) {
    return 'Your reel is eligible for $district discovery.';
  }

  @override
  String get pubViewReels => 'Go to Reels';

  @override
  String get pubOpenStudio => 'Open Creator Studio';

  @override
  String get pubFailedTitle => 'Upload failed';

  @override
  String get pubFailNetwork =>
      'The connection dropped. Nothing is lost, and the upload will continue where it stopped.';

  @override
  String pubFailModeration(String reason) {
    return 'This reel can’t be published. Reason: $reason.';
  }

  @override
  String get pubFailCancelled => 'Publishing was stopped.';

  @override
  String get pubFailLimits =>
      'Your reel doesn’t meet the length or size limits. Edit it and try again.';

  @override
  String get pubFailUnknown => 'Something went wrong. Please try again.';

  @override
  String get pubSavedAsDraft => 'Your reel is saved as a draft.';

  @override
  String get pubRetry => 'Retry';

  @override
  String get pubEditReel => 'Edit reel';

  @override
  String get pubSaveDraft => 'Save Draft';

  @override
  String get pubLeaveTitle => 'Stop publishing?';

  @override
  String get pubLeaveBody =>
      'Your reel stays saved as a draft and you can publish it later.';

  @override
  String get pubLeaveStay => 'Keep publishing';

  @override
  String get pubLeaveCancel => 'Stop and save draft';

  @override
  String get rsTitle => 'New reel';

  @override
  String get rsSaveDraft => 'Save Draft';

  @override
  String get rsNext => 'Next';

  @override
  String get rsPublish => 'Publish reel';

  @override
  String get rsPlay => 'Play preview';

  @override
  String get rsPause => 'Pause preview';

  @override
  String get rsPreviewEmpty => 'Add videos or photos to start your reel.';

  @override
  String rsPreviewLabel(String time, String length) {
    return 'Preview at $time of $length';
  }

  @override
  String rsSeekValue(String time) {
    return '$time';
  }

  @override
  String rsTextLayer(String text) {
    return 'Text: $text';
  }

  @override
  String rsStickerLayer(String sticker) {
    return 'Sticker $sticker';
  }

  @override
  String get rsTimeline => 'Timeline';

  @override
  String rsTotalOfLimit(String used, String limit) {
    return '$used of $limit';
  }

  @override
  String get rsTimelineEmpty => 'Your clips will appear here.';

  @override
  String get rsAddMedia => 'Add media';

  @override
  String get rsPhoto => 'Photo';

  @override
  String get rsVideo => 'Video';

  @override
  String rsClipLabel(int index, int count, String type, String length) {
    return 'Clip $index of $count, $type, $length';
  }

  @override
  String get rsMoveEarlier => 'Move earlier';

  @override
  String get rsMoveLater => 'Move later';

  @override
  String get rsClipsEmpty => 'Add videos and photos to start editing.';

  @override
  String get rsSelectClip => 'Select a clip in the timeline to edit it.';

  @override
  String get rsReplace => 'Replace';

  @override
  String get rsDuplicate => 'Duplicate';

  @override
  String get rsSplit => 'Split here';

  @override
  String get rsDelete => 'Delete';

  @override
  String get rsVolume => 'Volume';

  @override
  String get rsPhotoDuration => 'How long to show this photo';

  @override
  String rsSecondsShort(int seconds) {
    return '${seconds}s';
  }

  @override
  String rsMinutesShort(int minutes) {
    return '$minutes min';
  }

  @override
  String get rsTrimPhoto =>
      'Photos don’t need trimming. Choose how long this one stays on screen.';

  @override
  String get rsTrimUnavailable => 'This clip can’t be trimmed.';

  @override
  String get rsTrimRange => 'Trim start and end';

  @override
  String rsTrimStart(String time) {
    return 'Start $time';
  }

  @override
  String rsTrimEnd(String time) {
    return 'End $time';
  }

  @override
  String rsTrimLength(String length) {
    return 'Length $length';
  }

  @override
  String get rsResetTrim => 'Reset trim';

  @override
  String get rsTransitionBody => 'How this clip changes into the next one.';

  @override
  String get rsTransitionLast =>
      'The last clip has no next clip, so it has no transition.';

  @override
  String get rsApplyToAll => 'Apply to all clips';

  @override
  String get rsIntensity => 'Intensity';

  @override
  String get rsResetAdjust => 'Reset';

  @override
  String get rsOriginalAudio => 'Original audio';

  @override
  String get rsOriginalAudioBody => 'The sound from your own clips.';

  @override
  String rsMusicSelected(String title, String artist) {
    return '$title by $artist';
  }

  @override
  String rsMusicClipRange(String artist, String start, String end) {
    return '$artist · $start–$end';
  }

  @override
  String get rsAddMusic => 'Add music';

  @override
  String get rsChangeMusic => 'Change music';

  @override
  String get rsEditMusicClip => 'Choose part';

  @override
  String get rsRemoveMusic => 'Remove music';

  @override
  String get rsOriginalSound => 'Original sound';

  @override
  String get rsCoverPreview => 'Cover preview';

  @override
  String get rsCoverFirst => 'First frame';

  @override
  String get rsCoverFrame => 'Pick a frame';

  @override
  String get rsCoverImage => 'From photos';

  @override
  String get rsCoverAt => 'Frame at';

  @override
  String get rsCoverPhotos => 'Choose a photo';

  @override
  String rsCoverPhotoN(int index) {
    return 'Photo $index';
  }

  @override
  String get rsCoverText => 'Cover text';

  @override
  String get rsCoverTextHint => 'A short title for your cover';

  @override
  String get rsLayers => 'Layers';

  @override
  String get rsTextNew => 'New text';

  @override
  String get rsTextHint => 'Type something…';

  @override
  String get rsTextAdd => 'Add';

  @override
  String get rsTextEdit => 'Edit text';

  @override
  String get rsFont => 'Font';

  @override
  String get rsColor => 'Colour';

  @override
  String rsColorSwatch(String color) {
    return 'Colour $color';
  }

  @override
  String get rsAlignment => 'Alignment';

  @override
  String get rsAlignStart => 'Left';

  @override
  String get rsAlignCenter => 'Centre';

  @override
  String get rsAlignEnd => 'Right';

  @override
  String get rsBackground => 'Background';

  @override
  String get rsNoBackground => 'None';

  @override
  String rsBackgroundSwatch(String color) {
    return 'Background colour $color';
  }

  @override
  String get rsOpacity => 'Opacity';

  @override
  String get rsAnimation => 'Animation';

  @override
  String get rsSize => 'Size';

  @override
  String get rsRotation => 'Rotation';

  @override
  String get rsVisibleBetween => 'Shown on screen between';

  @override
  String rsVisibleFor(String length, String start) {
    return 'Visible for $length, from $start';
  }

  @override
  String rsAddSticker(String sticker) {
    return 'Add sticker $sticker';
  }

  @override
  String get rsStickerHint =>
      'Tap a sticker to add it. Drag it on the preview to move it; use two fingers to resize and rotate.';

  @override
  String get rsLengthLimit => 'Reel length';

  @override
  String get rsIssueNoClips => 'Add at least one video or photo.';

  @override
  String rsIssueTooLong(int seconds) {
    return 'Your reel is longer than $seconds seconds. Trim a clip or choose a longer reel length.';
  }

  @override
  String rsIssueTooManyClips(int count) {
    return 'You can use up to $count clips in one reel.';
  }

  @override
  String rsIssueTooManyPhotos(int count) {
    return 'You can use up to $count photos in one reel.';
  }

  @override
  String rsIssueVideoTooLarge(int mb) {
    return 'Videos can be up to $mb MB.';
  }

  @override
  String get rsIssueClipTooShort => 'One of your clips is too short.';

  @override
  String get rsSliverCut => 'A cut there would leave a clip that is too short.';

  @override
  String get rsDraftSaved => 'Saved to Drafts';

  @override
  String get rsDraftSaveFailed => 'Couldn’t save the draft. Try again.';

  @override
  String get rsMusicUnavailable => 'That track is no longer available.';

  @override
  String get rsLeaveTitle => 'Leave the editor?';

  @override
  String get rsLeaveBody => 'You have unsaved changes.';

  @override
  String get rsLeaveStay => 'Keep editing';

  @override
  String get rsLeaveDiscard => 'Discard';

  @override
  String get rsLeaveSave => 'Save draft';

  @override
  String get rsPickerTitle => 'Add to your reel';

  @override
  String get rsPickerBody =>
      'Tap videos and photos in the order you want them. You can reorder them later.';

  @override
  String get rsReplaceTitle => 'Replace clip';

  @override
  String get rsReplaceBody => 'Pick the video or photo to use instead.';

  @override
  String get rsFilterAll => 'All';

  @override
  String get rsFilterVideos => 'Videos';

  @override
  String get rsFilterPhotos => 'Photos';

  @override
  String get rsRecord => 'Record a video';

  @override
  String get rsRecordFailed => 'Couldn’t record. Try again.';

  @override
  String get rsPickerEmpty => 'Nothing here yet';

  @override
  String get rsPickerEmptyBody =>
      'Record a video or add photos to your gallery.';

  @override
  String rsPickerAdd(int count) {
    return 'Add $count to reel';
  }

  @override
  String get rsPickerAddNone => 'Select videos or photos';

  @override
  String rsSelectedSummary(int videos, int photos) {
    return '$videos videos, $photos photos';
  }

  @override
  String rsSelectedN(int n) {
    return 'selected, number $n';
  }

  @override
  String get rsTooLarge => 'Too large';

  @override
  String rsGalleryItemTooLarge(String type, String size) {
    return '$type, $size. Too large to add.';
  }

  @override
  String get rsMusicTitle => 'Add music';

  @override
  String get rsMusicSearchHint => 'Search title, artist, language or genre';

  @override
  String get rsClearSearch => 'Clear search';

  @override
  String get rsAllMusic => 'All music';

  @override
  String get rsTrendingNow => 'Trending now';

  @override
  String get rsMusicRightsNote =>
      'Every track here is licensed, owned by BLOCKS, or made by creators who allow its use.';

  @override
  String get rsMusicEmpty => 'No music found';

  @override
  String get rsMusicEmptyBody => 'Try another word or category.';

  @override
  String rsReelsUsing(String reels) {
    return '$reels reels';
  }

  @override
  String rsTrackLabel(String title, String meta) {
    return '$title. $meta';
  }

  @override
  String rsPreviewOf(String title) {
    return 'Preview $title';
  }

  @override
  String rsStopPreviewOf(String title) {
    return 'Stop preview of $title';
  }

  @override
  String get rsClipTitle => 'Choose the part to use';

  @override
  String get rsClipRange => 'Music start and end';

  @override
  String rsClipNote(String length) {
    return 'The music can be up to $length long, the length of your reel.';
  }

  @override
  String get rsPreviewClip => 'Preview';

  @override
  String get rsStopPreview => 'Stop';

  @override
  String get rsUseClip => 'Use this part';

  @override
  String get rsDetailsTitle => 'Reel details';

  @override
  String get rsHashtags => 'Hashtags';

  @override
  String get rsTagPeople => 'Tag people';

  @override
  String get rsTagNobody => 'Nobody tagged';

  @override
  String rsTaggedCount(int count) {
    return '$count people tagged';
  }

  @override
  String get rsTagSearchHint => 'Search people';

  @override
  String rsTagDone(int count) {
    return 'Done ($count)';
  }

  @override
  String get rsAllowComments => 'Allow comments';

  @override
  String get rsAllowRemix => 'Allow remix';

  @override
  String get rsAllowRemixBody =>
      'Others can use your audio or build on your reel.';

  @override
  String get rsAllowSharing => 'Allow sharing';

  @override
  String get rsQualityTitle => 'Upload quality';

  @override
  String get rsQualityBody =>
      'BLOCKS makes your files smaller on your phone, so uploads are faster and use less data.';

  @override
  String get rsSizeOriginal => 'Original';

  @override
  String get rsSizeOptimized => 'Optimized';

  @override
  String get rsSizeSaved => 'Smaller';

  @override
  String rsSizeSummary(String original, String optimized, int percent) {
    return 'Original $original, optimized $optimized, $percent percent smaller';
  }

  @override
  String rsQualityNote(String resolution) {
    return 'Videos are sent at up to $resolution.';
  }

  @override
  String get rsQualityNoteOriginal =>
      'Your files are sent exactly as they are. This uses the most data.';

  @override
  String get rsServerNote =>
      'BLOCKS checks and re-encodes every upload on its own servers, so quality and safety never depend on your phone.';

  @override
  String get csNavLabel => 'Creator Studio sections';

  @override
  String get csNavOverview => 'Overview';

  @override
  String get csNavReels => 'Reels';

  @override
  String get csNavPosts => 'Posts';

  @override
  String get csNavDrafts => 'Drafts';

  @override
  String get csNavAnalytics => 'Analytics';

  @override
  String get csNavReach => 'Reach';

  @override
  String get csNavEarnings => 'Earnings';

  @override
  String get csNavPayout => 'Payout';

  @override
  String get csEstimatedChip => 'Estimated';

  @override
  String get csThisMonth => 'This month';

  @override
  String csThisMonthAmount(String amount) {
    return 'This month $amount';
  }

  @override
  String get csAvailable => 'Available';

  @override
  String get csPending => 'Pending';

  @override
  String get csPaid => 'Paid';

  @override
  String get csMenuTitle => 'Your studio';

  @override
  String get csHintReels => 'Your published reels';

  @override
  String get csHintPosts => 'Photo and text posts';

  @override
  String get csHintDrafts => 'Unfinished reels';

  @override
  String csHintDraftsCount(int count) {
    return '$count unfinished';
  }

  @override
  String get csHintAnalytics => 'Views, watch time, audience';

  @override
  String get csHintReach => 'Climb the Reach Ladder';

  @override
  String get csHintEarnings => 'Estimated rewards';

  @override
  String get csHintPayout => 'Verify, add bank, withdraw';

  @override
  String get csPayoutSetupTitle => 'Get paid';

  @override
  String csPayoutSetupBody(String minimum) {
    return 'Verify your identity, add a bank account, then withdraw once you have $minimum available.';
  }

  @override
  String get csPayoutReadyTitle => 'Ready to withdraw';

  @override
  String csPayoutReadyBody(String amount) {
    return '$amount is available to withdraw.';
  }

  @override
  String get csStepIdentity => 'Verify identity';

  @override
  String get csStepBank => 'Add a bank account';

  @override
  String get csStepWithdraw => 'Withdraw your earnings';

  @override
  String get csStepDone => 'done';

  @override
  String get csSetUpPayouts => 'Set up payouts';

  @override
  String get csRequestPayout => 'Request payout';

  @override
  String get csNewReel => 'New reel';

  @override
  String get csNewPost => 'New post';

  @override
  String get csNew => 'New';

  @override
  String get csNoCaption => 'No caption';

  @override
  String get csReelsEmpty => 'No reels yet';

  @override
  String get csReelsEmptyBody =>
      'Make your first reel and it starts in your District.';

  @override
  String get csPostsEmpty => 'No posts yet';

  @override
  String get csPostsEmptyBody =>
      'Share a photo or a thought with your District.';

  @override
  String csReelRowLabel(String title, String views) {
    return '$title, $views views';
  }

  @override
  String csViewsCount(String views) {
    return '$views views';
  }

  @override
  String get csDraftsEmpty => 'No drafts';

  @override
  String get csDraftsEmptyBody => 'Reels you save while editing appear here.';

  @override
  String get csDraftReady => 'Ready to publish';

  @override
  String get csDraftNeedsChanges => 'Needs changes';

  @override
  String csDraftClips(int count, String length) {
    return '$count clips · $length';
  }

  @override
  String csDraftEdited(String ago) {
    return 'Edited $ago';
  }

  @override
  String csDraftLabel(int count, String length, String status) {
    return 'Draft with $count clips, $length, $status';
  }

  @override
  String get csContinueEditing => 'Continue editing';

  @override
  String get csDraftDeleteTitle => 'Delete this draft?';

  @override
  String get csDraftDeleteBody =>
      'It will be removed from this device. The videos and photos in your gallery are not touched.';

  @override
  String get csDraftDeleted => 'Draft deleted';

  @override
  String get csDraftDuplicated => 'Draft duplicated';

  @override
  String get caRangeLabel => 'Time range';

  @override
  String get caRange7 => '7 days';

  @override
  String get caRange28 => '28 days';

  @override
  String get caRange90 => '90 days';

  @override
  String get caViewsChartTitle => 'Views per day';

  @override
  String caViewsChartSubtitle(String views, int days) {
    return '$views views in $days days';
  }

  @override
  String caViewsChartLabel(int days, String views) {
    return 'Views per day over the last $days days, $views in total';
  }

  @override
  String get caViews => 'Views';

  @override
  String get caQualifiedViews => 'Qualified views';

  @override
  String get caWatchTime => 'Watch time';

  @override
  String get caEngagement => 'Engagement';

  @override
  String get caLikes => 'Likes';

  @override
  String get caComments => 'Comments';

  @override
  String get caShares => 'Shares';

  @override
  String get caSaves => 'Saves';

  @override
  String get caFollowers => 'New followers';

  @override
  String get caAudienceTitle => 'Where your viewers are';

  @override
  String get caAudienceOther => 'Other places';

  @override
  String get caReelsTitle => 'Your reels';

  @override
  String get caReelsHint => 'Tap a reel for its full numbers.';

  @override
  String get caCollecting => 'Collecting data';

  @override
  String get caCollectingBody =>
      'Numbers for a new reel appear shortly after it is published.';

  @override
  String caCompletionShort(String rate) {
    return '$rate watched to end';
  }

  @override
  String caHours(int hours) {
    return '$hours h';
  }

  @override
  String caMinutes(int minutes) {
    return '$minutes min';
  }

  @override
  String get caReelTitle => 'Reel analytics';

  @override
  String caQualifiedReachIs(String reach) {
    return '$reach qualified reach';
  }

  @override
  String get caReachTitle => 'Reach Ladder';

  @override
  String get caReachBody =>
      'How far this reel has climbed from District to Global.';

  @override
  String get caAvgWatch => 'Average watch';

  @override
  String caSecondsOf(int current, int total) {
    return '${current}s of ${total}s';
  }

  @override
  String get caCompletion => 'Watched to the end';

  @override
  String get caEstEarnings => 'Estimated earnings';

  @override
  String get caRetentionTitle => 'Audience retention';

  @override
  String get caRetentionBody =>
      'How many viewers were still watching, from the start to the end of the reel.';

  @override
  String caRetentionLabel(String rate) {
    return 'Audience retention curve: $rate watched to the end';
  }

  @override
  String get crYourLevel => 'Your Reach level';

  @override
  String crYourLevelBody(String reach) {
    return '$reach qualified reach in the last 30 days';
  }

  @override
  String get crLevelsTitle => 'The four levels';

  @override
  String get crLevelsBody =>
      'Content starts in your District and climbs as more real people watch it.';

  @override
  String crRange(String from, String to) {
    return '$from – $to qualified reach';
  }

  @override
  String crRangeOpen(String from) {
    return '$from+ qualified reach';
  }

  @override
  String get crLevelReached => 'Reached';

  @override
  String get crLevelLocked => 'Not reached yet';

  @override
  String get crReelsTitle => 'Your reels on the ladder';

  @override
  String get crReelsBody => 'How far each reel is from its next level.';

  @override
  String crReelProgress(
    String title,
    String level,
    String remaining,
    String next,
  ) {
    return '$title: $level. $remaining more qualified reach to reach $next.';
  }

  @override
  String crReelTop(String title) {
    return '$title: at the top of the ladder.';
  }

  @override
  String get crTopLevel => 'At the top of the ladder';

  @override
  String crToNext(String remaining, String next) {
    return '$remaining more to reach $next';
  }

  @override
  String get crQualifiedTitle => 'What is qualified reach?';

  @override
  String get crQualifiedBody =>
      'Qualified reach counts real people who actually watched your content. Repeat views from the same person, bots and accidental taps do not count. The thresholds for each level are set by BLOCKS and can change.';

  @override
  String get ceAvailableHint => 'Ready to withdraw';

  @override
  String get cePendingHint => 'Still being checked';

  @override
  String get cePaidHint => 'Sent to your bank';

  @override
  String get ceHeroNote =>
      'An estimate of this cycle’s reward. It is confirmed when the month closes.';

  @override
  String get ceByLevelTitle => 'Earnings by Reach level';

  @override
  String get ceByLevelBody => 'Where the views behind your estimate came from.';

  @override
  String get ceLevelTotal => 'Estimated total';

  @override
  String get ceMonthsTitle => 'Last 6 months';

  @override
  String ceMonthsLabel(String amount) {
    return 'Monthly earnings for the last 6 months. This month: $amount';
  }

  @override
  String get ceRewardTitle => 'Qualified Creator Reward';

  @override
  String get ceRewardBody =>
      'Your reward is not a fixed amount per view. It depends on the quality of the attention your content earns.';

  @override
  String get ceReachLevel => 'Reach level';

  @override
  String get cePoolTitle => 'Reward pool';

  @override
  String cePoolBody(String reach, String period) {
    return '$reach qualified reach so far ($period). Creators share the monthly pool in proportion to their qualified reach and its quality.';
  }

  @override
  String get cePoolNote =>
      'Estimated. The pool and each share are final only when the month closes.';

  @override
  String get ceHowItWorks => 'How rewards work';

  @override
  String get ceHowTitle => 'How the Qualified Creator Reward works';

  @override
  String get ceHow1 =>
      'Only qualified views count: real people, counted once, who watched for long enough.';

  @override
  String get ceHow2 =>
      'Watch time, shares, saves and engagement show how much people valued your content.';

  @override
  String get ceHow3 =>
      'Your Reach level matters too: reaching further on the ladder lifts your share of the pool.';

  @override
  String get ceHow4 =>
      'At the end of the month the pool is shared among creators, and your amount becomes final.';

  @override
  String get ceHowDisclaimer =>
      'Amounts shown are estimates. They can change after quality and fraud checks, and are never a promise of payment.';

  @override
  String get ceGoToPayout => 'Go to Payout Center';

  @override
  String get kycTitle => 'Identity verification';

  @override
  String get kycFlowTitle => 'Verify your identity';

  @override
  String get kycNotStarted => 'Not started';

  @override
  String get kycPending => 'Pending';

  @override
  String get kycUnderReview => 'Under review';

  @override
  String get kycVerified => 'Verified';

  @override
  String get kycRejected => 'Rejected';

  @override
  String get kycActionRequired => 'Action required';

  @override
  String get kycExpired => 'Expired';

  @override
  String get kycHintNotStarted => 'Verify your identity to receive payouts.';

  @override
  String get kycHintPending =>
      'We have your documents and will start the review shortly.';

  @override
  String get kycHintUnderReview =>
      'Your documents are being reviewed. You will be notified when it is done.';

  @override
  String get kycHintVerified =>
      'Your identity is verified. You can receive payouts.';

  @override
  String get kycHintRejected =>
      'We could not verify your identity from these documents.';

  @override
  String get kycHintActionRequired =>
      'We need a clearer or different document to continue.';

  @override
  String get kycHintExpired =>
      'Your verification has expired. Renew it to keep receiving payouts.';

  @override
  String get kycReasonMismatch =>
      'The name or details did not match the document.';

  @override
  String get kycReasonUnreadable => 'The document could not be read clearly.';

  @override
  String get kycReasonBlurry => 'The picture was too blurry.';

  @override
  String get kycReasonExpiredDocument => 'The document has expired.';

  @override
  String get kycReasonGeneric => 'Please check your details and try again.';

  @override
  String get kycIndividual => 'Individual';

  @override
  String get kycBusiness => 'Business';

  @override
  String get kycIndividualBody => 'Verify yourself with a government ID.';

  @override
  String get kycBusinessBody =>
      'Verify a business with its registration and an authorised person.';

  @override
  String get kycDocReceived => 'Received';

  @override
  String get kycDocAccepted => 'Accepted';

  @override
  String get kycDocRejected => 'Rejected';

  @override
  String get kycDetailsTitle => 'Verification details';

  @override
  String get kycType => 'Type';

  @override
  String get kycLegalName => 'Full legal name';

  @override
  String get kycBusinessName => 'Business name';

  @override
  String get kycSubmitted => 'Submitted';

  @override
  String get kycReviewed => 'Reviewed';

  @override
  String get kycValidUntil => 'Valid until';

  @override
  String get kycDocumentsTitle => 'Documents';

  @override
  String get kycMaskedNote =>
      'Numbers are always shown hidden. BLOCKS never shows a full ID number.';

  @override
  String get kycStart => 'Start verification';

  @override
  String get kycRenew => 'Renew verification';

  @override
  String get kycTryAgain => 'Try again';

  @override
  String get kycCheckStatus => 'Check status';

  @override
  String get kycPrivacyTitle => 'How your documents are protected';

  @override
  String get kycPrivacy1 =>
      'Sent securely and stored encrypted in private storage.';

  @override
  String get kycPrivacy2 => 'Not kept on this phone after you send them.';

  @override
  String get kycPrivacy3 =>
      'Only a small, trained team can open them, and every access is logged.';

  @override
  String get kycPrivacy4 =>
      'They are deleted when the law no longer requires them to be kept.';

  @override
  String kycStepOf(int current, int total) {
    return 'Step $current of $total';
  }

  @override
  String get kycTypeTitle => 'Who is being verified?';

  @override
  String get kycTypeBody => 'Choose how you will receive payouts.';

  @override
  String get kycDetailsHeading => 'Your details';

  @override
  String get kycDetailsBody =>
      'Enter your name exactly as it appears on your document.';

  @override
  String get kycNameHelp => 'Must match your document and your bank account.';

  @override
  String get kycSignatoryName => 'Authorised person’s full name';

  @override
  String get kycDocsHeading => 'Your documents';

  @override
  String get kycDocsBody =>
      'Choose a document, enter its number and add a clear picture.';

  @override
  String get kycIdentityDoc => 'Identity document';

  @override
  String get kycBusinessDoc => 'Business document';

  @override
  String get kycSignatoryDoc => 'Authorised person’s ID';

  @override
  String get kycNumber => 'Number';

  @override
  String get kycDocument => 'Document';

  @override
  String get kycFile => 'File';

  @override
  String get kycFileBack => 'Back side';

  @override
  String get kycFront => 'Front';

  @override
  String get kycBack => 'Back';

  @override
  String get kycUploadFront => 'Upload a picture';

  @override
  String get kycUploadBack => 'Upload the back';

  @override
  String get kycNoFile => 'No file chosen';

  @override
  String get kycChoose => 'Choose';

  @override
  String get kycRemoveFile => 'Remove file';

  @override
  String kycFileRules(int mb, String types) {
    return 'Up to $mb MB. Accepted: $types.';
  }

  @override
  String get kycFileNote =>
      'Your file is sent securely and is not kept on this phone.';

  @override
  String get kycFileCamera => 'Take a photo';

  @override
  String get kycFileGallery => 'Choose from gallery';

  @override
  String get kycFilePdf => 'Choose a PDF';

  @override
  String get kycFileDemoLarge => 'Demo: a file that is too large';

  @override
  String get kycErrName => 'Enter your full name using letters only.';

  @override
  String get kycErrBusiness => 'Enter the business name.';

  @override
  String get kycErrNumber =>
      'That number does not look right for this document.';

  @override
  String get kycErrFileLarge => 'That file is too large.';

  @override
  String get kycErrFileType => 'That file type is not accepted.';

  @override
  String get kycErrFileMissing => 'Add a picture of the document.';

  @override
  String get kycErrDocMissing => 'Choose a document and add it.';

  @override
  String get kycErrDocUnsupported => 'That document is not accepted here.';

  @override
  String get kycReviewHeading => 'Check and submit';

  @override
  String get kycReviewBody =>
      'Make sure everything is right. Numbers are shown hidden.';

  @override
  String get kycReviewWarning =>
      'Your documents are sent securely for review. Providing false information can lead to your account being restricted.';

  @override
  String get kycSubmit => 'Submit for verification';

  @override
  String get kycProcessingNote =>
      'This usually takes a moment. You can leave this screen; we will tell you when it is done.';

  @override
  String get kycStepReceived => 'Documents received';

  @override
  String get kycStepReview => 'Review';

  @override
  String get kycStepResult => 'Result';

  @override
  String get bankEmptyTitle => 'No bank account yet';

  @override
  String get bankEmptyBody => 'Add the account you want payouts sent to.';

  @override
  String get bankAdd => 'Add bank account';

  @override
  String get bankAddTitle => 'Add bank account';

  @override
  String get bankSecurityNote =>
      'Adding, changing or removing a bank account asks for your password and a code, and BLOCKS e-mails you about it.';

  @override
  String get bankPrimary => 'Primary';

  @override
  String get bankMakePrimary => 'Make primary';

  @override
  String get bankRemove => 'Remove';

  @override
  String get bankRemoveTitle => 'Remove this account?';

  @override
  String bankRemoveBody(String bank, String last4) {
    return '$bank •••• $last4 will no longer receive payouts.';
  }

  @override
  String get bankRemoved => 'Bank account removed';

  @override
  String get bankPrimaryNow => 'This is now your primary account';

  @override
  String bankCardLabel(String bank, String last4, String status) {
    return '$bank account ending $last4, $status';
  }

  @override
  String get bankHolder => 'Account holder';

  @override
  String get bankHolderHelp => 'Exactly as on your bank account.';

  @override
  String get bankAccountNumber => 'Account number';

  @override
  String get bankConfirmAccount => 'Confirm account number';

  @override
  String get bankIfsc => 'IFSC code';

  @override
  String get bankBranch => 'Branch';

  @override
  String get bankType => 'Account type';

  @override
  String get bankSavings => 'Savings';

  @override
  String get bankCurrent => 'Current';

  @override
  String get bankFormNote =>
      'Your account number is sent once, securely, and then never shown again. Only the last 4 digits stay visible.';

  @override
  String get bankSaveAndVerify => 'Save and verify';

  @override
  String get bankVerifyingNow => 'Checking with your bank…';

  @override
  String get bankEditDetails => 'Edit details';

  @override
  String get bankManageAccounts => 'Manage bank accounts';

  @override
  String get bankAwaitingIdentity => 'Waiting for identity check';

  @override
  String get bankVerifying => 'Verifying';

  @override
  String get bankVerified => 'Verified';

  @override
  String get bankNameMismatch => 'Name doesn’t match';

  @override
  String get bankFailed => 'Verification failed';

  @override
  String get bankHintAwaitingIdentity =>
      'Saved. We will check the name as soon as your identity is verified.';

  @override
  String get bankHintVerifying => 'We are checking this account with the bank.';

  @override
  String get bankHintVerified => 'This account can receive payouts.';

  @override
  String get bankHintNameMismatch =>
      'The account holder’s name must match your verified identity. Edit the details or remove the account.';

  @override
  String get bankHintFailed =>
      'We could not verify this account. Check the details and try again.';

  @override
  String get bankErrHolderRequired => 'Enter the account holder’s name.';

  @override
  String get bankErrHolderInvalid => 'Use letters only for the name.';

  @override
  String get bankErrAccountRequired => 'Enter the account number.';

  @override
  String get bankErrAccountInvalid => 'Account numbers have 9 to 18 digits.';

  @override
  String get bankErrDuplicate => 'This account is already added.';

  @override
  String get bankErrConfirmRequired => 'Type the account number again.';

  @override
  String get bankErrConfirmMismatch => 'The two account numbers do not match.';

  @override
  String get bankErrIfscRequired => 'Enter the IFSC code.';

  @override
  String get bankErrIfscInvalid =>
      'An IFSC has 11 characters, like HDFC0001234.';

  @override
  String get bankErrIfscUnknown => 'We do not recognise this IFSC.';

  @override
  String get poTitle => 'Payout Center';

  @override
  String get poTabOverview => 'Overview';

  @override
  String get poTabMethods => 'Methods';

  @override
  String get poTabVerification => 'Verification';

  @override
  String get poTabHistory => 'History';

  @override
  String get poAvailable => 'Available to withdraw';

  @override
  String poPendingPaid(String pending, String paid) {
    return 'Pending $pending · Paid $paid';
  }

  @override
  String poOpenTitle(String amount) {
    return 'Payout of $amount in progress';
  }

  @override
  String poArrival(String from, String to) {
    return 'Expected $from – $to';
  }

  @override
  String get poEligibilityTitle => 'Withdrawal checklist';

  @override
  String get poEligibilityBody => 'BLOCKS checks these before every payout.';

  @override
  String get elIdentity => 'Identity verified';

  @override
  String get elBank => 'Bank account verified';

  @override
  String elMinimum(String minimum) {
    return 'Balance of at least $minimum';
  }

  @override
  String get elNoHold => 'No safety hold on payouts';

  @override
  String get elStanding => 'Account in good standing';

  @override
  String get poNotYet => 'not yet';

  @override
  String get poActionVerify => 'Verify identity';

  @override
  String get poActionAddBank => 'Add bank';

  @override
  String get poActionFixBank => 'Fix bank';

  @override
  String poHoldUntil(String date) {
    return 'Paused until $date';
  }

  @override
  String get poRulesTitle => 'Payout rules';

  @override
  String poRuleMinimum(String amount) {
    return 'Minimum withdrawal $amount.';
  }

  @override
  String poRuleTiming(int minDays, int maxDays) {
    return 'Money arrives in $minDays to $maxDays business days.';
  }

  @override
  String poRuleStepUp(String amount) {
    return 'Withdrawals of $amount or more need an extra confirmation.';
  }

  @override
  String poRuleHold(int hours) {
    return 'Payouts pause for $hours hours after a bank account change.';
  }

  @override
  String poBlockedBy(String reason) {
    return 'Not ready yet: $reason';
  }

  @override
  String get poRequest => 'Request payout';

  @override
  String get poTaxInfo => 'Tax information';

  @override
  String get poHistoryEmpty => 'No payouts yet';

  @override
  String get poHistoryEmptyBody => 'Your payouts will appear here.';

  @override
  String get poRequested => 'Requested';

  @override
  String get poProcessing => 'Processing';

  @override
  String get poCompleted => 'Completed';

  @override
  String get poFailed => 'Failed';

  @override
  String get poReversed => 'Reversed';

  @override
  String get poOnHold => 'On hold';

  @override
  String get poReasonBankRejected =>
      'The bank could not accept this payment. The money is back in your balance.';

  @override
  String get poReasonBankReturned =>
      'The bank returned this payment. The money is back in your balance.';

  @override
  String get poReasonSecurityReview =>
      'Held for a security check. We will update you.';

  @override
  String get poReasonGeneric => 'Something went wrong with this payout.';

  @override
  String poPaidOn(String date) {
    return 'Paid on $date';
  }

  @override
  String poRequestedOn(String date) {
    return 'Requested $date';
  }

  @override
  String poReference(String reference) {
    return 'Reference $reference';
  }

  @override
  String poTileLabel(String amount, String status, String date) {
    return 'Payout of $amount, $status, requested $date';
  }

  @override
  String get poRequestTitle => 'Request payout';

  @override
  String poMinimumIs(String amount) {
    return 'Minimum $amount';
  }

  @override
  String get poAmount => 'Amount to withdraw';

  @override
  String get poAll => 'All';

  @override
  String get poSendTo => 'Send to';

  @override
  String get poSummaryTitle => 'Summary';

  @override
  String get poTaxNote =>
      'BLOCKS does not calculate tax. If any deduction applies, the payout service applies it and shows it on your statement.';

  @override
  String get poReview => 'Review payout';

  @override
  String get poConfirmTitle => 'Confirm payout';

  @override
  String get poConfirmAmount => 'Amount';

  @override
  String get poConfirmTo => 'To';

  @override
  String get poConfirmArrival => 'Expected arrival';

  @override
  String get poConfirmNote =>
      'The money is set aside from your balance now and sent to your bank.';

  @override
  String get poConfirmStepUp =>
      'This amount needs an extra confirmation with your password and a code.';

  @override
  String poConfirmButton(String amount) {
    return 'Confirm $amount';
  }

  @override
  String get poNotReadyTitle => 'You can’t withdraw yet';

  @override
  String get poNotReadyBody => 'Finish the steps in the Payout Center first.';

  @override
  String get poGoToCenter => 'Open Payout Center';

  @override
  String get poErrBelowMinimum => 'That is below the minimum withdrawal.';

  @override
  String get poErrExceeds => 'That is more than your available balance.';

  @override
  String get poErrNotEligible => 'You are not eligible to withdraw right now.';

  @override
  String get poErrOnHold => 'Payouts are paused after your recent bank change.';

  @override
  String get poErrNoBank => 'Choose a bank account first.';

  @override
  String get poErrStepUp =>
      'The extra confirmation was missing or expired. Please try again.';

  @override
  String get poSuccessTitle => 'Payout requested';

  @override
  String poSuccessBody(String amount, String bank, String window) {
    return '$amount is on its way to $bank. Expected $window.';
  }

  @override
  String get poViewHistory => 'View history';

  @override
  String get suTitle => 'Confirm it’s you';

  @override
  String get suWhyAddBank =>
      'You are adding a payout account. Confirm it’s you first.';

  @override
  String get suWhyChangeBank =>
      'You are changing your primary payout account. Confirm it’s you first.';

  @override
  String get suWhyRemoveBank =>
      'You are removing a payout account. Confirm it’s you first.';

  @override
  String get suWhyPayout =>
      'This is a large withdrawal. Confirm it’s you first.';

  @override
  String get suWhyTax =>
      'You are changing your tax details. Confirm it’s you first.';

  @override
  String get suWrongPassword => 'That password isn’t right.';

  @override
  String get suConfirm => 'Confirm';

  @override
  String get suNeverShare =>
      'BLOCKS will never ask for this code in a message or call. Never share it.';

  @override
  String get suCodeAuthenticator =>
      'Enter the code from your authenticator app.';

  @override
  String suCodeSentPhone(String destination) {
    return 'We sent a code to $destination.';
  }

  @override
  String suCodeSentEmail(String destination) {
    return 'We sent a code to $destination.';
  }

  @override
  String get taxTitle => 'Tax information';

  @override
  String get taxPanTitle => 'PAN';

  @override
  String get taxPanLabel => 'PAN number';

  @override
  String get taxProvided => 'Provided';

  @override
  String get taxNotProvided => 'Not provided yet';

  @override
  String taxUpdatedOn(String date) {
    return 'Updated $date';
  }

  @override
  String get taxAdd => 'Add PAN';

  @override
  String get taxUpdate => 'Update PAN';

  @override
  String get taxSave => 'Save PAN';

  @override
  String get taxSaved => 'Tax information saved';

  @override
  String get taxErrPan => 'A PAN has 10 characters, like ABCDE1234F.';

  @override
  String get taxNote =>
      'BLOCKS collects this so the payout provider can meet tax rules. BLOCKS does not calculate tax in the app. If a deduction applies, the payout service applies and itemises it. The number is shown hidden after you save it.';

  @override
  String get cdTitle => 'Creator and payouts';

  @override
  String get cdIntro =>
      'Steer the mock server so you can show the unhappy paths as well.';

  @override
  String cdStatus(String kyc, String balance, int banks, int payouts) {
    return 'Identity: $kyc · Available $balance · $banks bank accounts · $payouts open payouts';
  }

  @override
  String get cdKycOutcome => 'Next identity review ends as';

  @override
  String get cdOutcomeVerified => 'Verified';

  @override
  String get cdOutcomeRejected => 'Rejected';

  @override
  String get cdOutcomeAction => 'Action required';

  @override
  String get cdPayoutOutcome => 'Next payout ends as';

  @override
  String get cdPayCompleted => 'Completed';

  @override
  String get cdPayFailed => 'Failed';

  @override
  String get cdPayHold => 'On hold';

  @override
  String get cdPayReversed => 'Reversed';

  @override
  String get cdPublishOutcome => 'Next reel publish';

  @override
  String get cdPubNormal => 'Goes live';

  @override
  String get cdPubUploadFails => 'Upload fails once';

  @override
  String get cdPubModeration => 'Rejected by moderation';

  @override
  String get cdPubNote => 'Applies to the next publish only.';

  @override
  String get cdSafetyHold => 'Pause payouts for 24 h after a bank change';

  @override
  String get cdSafetyHoldBody =>
      'Shows the safety hold. Off by default so the walk-through is not blocked.';

  @override
  String get cdOpenStudio => 'Open Creator Studio';

  @override
  String get cdExpire => 'Expire identity verification';

  @override
  String get cdReset => 'Reset creator and payout data';

  @override
  String get cdResetDone => 'Creator and payout data reset';

  @override
  String get kycDob => 'Date of birth';

  @override
  String kycDobHelp(int age) {
    return 'You must be at least $age years old.';
  }

  @override
  String get kycErrDobRequired => 'Choose your date of birth.';

  @override
  String get kycErrDobInvalid => 'Enter a valid date of birth.';

  @override
  String kycErrAge(int age) {
    return 'You must be at least $age years old to be verified.';
  }

  @override
  String get kycBusinessType => 'Business type';

  @override
  String get kycErrBusinessType => 'Choose the type of business.';

  @override
  String get kycVerifiedOn => 'Verified on';

  @override
  String get rsLanesTitle => 'Text and stickers on the timeline';

  @override
  String get rsLanesHint =>
      'Each bar shows when it is on screen. Tap one to edit it.';

  @override
  String rsLaneText(String content, String start, String end) {
    return 'Text “$content”, on screen from $start to $end';
  }

  @override
  String rsLaneSticker(String content, String start, String end) {
    return 'Sticker $content, on screen from $start to $end';
  }

  @override
  String get taxAccountTitle => 'Account';

  @override
  String get taxAccountType => 'Account type';

  @override
  String get taxAccountUnknown => 'Not set yet';

  @override
  String get taxDocsTitle => 'Tax and payout documents';

  @override
  String get taxDocsBody =>
      'Statements and any tax-withholding certificates your payout provider issues for your payouts appear here.';

  @override
  String get taxDocsEmpty =>
      'No documents yet. They appear after your first completed payout.';

  @override
  String get taxDocStatement => 'Payout statement';

  @override
  String get taxDocCertificate => 'Tax withholding certificate';

  @override
  String taxDocQuarter(int quarter, int year) {
    return 'Quarter $quarter, $year';
  }

  @override
  String get taxDocReady => 'Available';

  @override
  String get taxDocLater => 'Issued after the period ends, if it applies';

  @override
  String get csNavMusic => 'Copyright & music';

  @override
  String get cmTitle => 'Copyright and music';

  @override
  String get cmIntro =>
      'The tracks and original audio in your reels, and whether each can still be used.';

  @override
  String get cmUsedTitle => 'Music in your reels';

  @override
  String get cmUsedBody =>
      'Tracks come from licensed, BLOCKS-owned or creator-owned catalogues.';

  @override
  String get cmEmpty =>
      'No music in your reels yet. Add a track when you create a reel.';

  @override
  String get cmStatusAvailable => 'Available';

  @override
  String get cmStatusExpiring => 'Licence ends soon';

  @override
  String get cmStatusUnavailable => 'Not available for new reels';

  @override
  String cmLicenceUntil(String date) {
    return 'Licence until $date';
  }

  @override
  String get cmReasonExpired => 'The licence for this track has ended.';

  @override
  String get cmReasonRegion =>
      'This track is not licensed for use in your country.';

  @override
  String get cmReasonRestricted => 'This track has no usable licence.';

  @override
  String cmReelsUsing(int n) {
    return 'Reels using it: $n';
  }

  @override
  String get cmOriginalTitle => 'Your original audio';

  @override
  String get cmOriginalBody =>
      'Sound you recorded in your reels. Choose whether others can reuse it.';

  @override
  String get cmOriginalEmpty =>
      'No original audio yet. Record sound in a reel and it appears here.';

  @override
  String get cmReuseLabel => 'Others can reuse this audio';

  @override
  String get cmReuseOnDone => 'Others can now reuse this audio';

  @override
  String get cmReuseOffDone => 'Others can no longer reuse this audio';

  @override
  String get cmRightsNote =>
      'BLOCKS checks rights again before every publish, and availability can change when a licence ends. This is not legal advice.';

  @override
  String get authCreateAccount => 'Create an account';

  @override
  String get regTitle => 'Create your account';

  @override
  String get regSubtitle => 'Join BLOCKS with your e-mail or phone number.';

  @override
  String get regName => 'Full name';

  @override
  String get regUsername => 'Username';

  @override
  String get regUsernameHelp => '3–30 letters, numbers, dots or underscores';

  @override
  String get regEmail => 'E-mail';

  @override
  String get regPhone => 'Phone number';

  @override
  String get regContactHelp =>
      'Give an e-mail, a phone number, or both. We send a code to confirm it.';

  @override
  String get regPassword => 'Password';

  @override
  String get regDob => 'Date of birth';

  @override
  String get regDobHelp =>
      'Only used to check you are 13 or older. Never shown to others.';

  @override
  String get regDobChoose => 'Choose your date of birth';

  @override
  String get regButton => 'Create account';

  @override
  String get regHaveAccount => 'I already have an account';

  @override
  String get regErrRequired => 'This is required';

  @override
  String get regErrInvalid => 'That does not look right';

  @override
  String get regErrUsername => 'Use 3–30 letters, numbers, dots or underscores';

  @override
  String get regErrTaken => 'That username is not available';

  @override
  String get regErrContact => 'Enter an e-mail or a phone number';

  @override
  String get regErrTooYoung => 'You must be at least 13 to join';

  @override
  String get regErrPassword =>
      'Choose a stronger password (longer, with upper and lower case letters, a number and a symbol)';

  @override
  String get cvTitle => 'Enter your code';

  @override
  String cvSentTo(String destination) {
    return 'We sent a 6-digit code to $destination.';
  }

  @override
  String get cvSent => 'We sent you a 6-digit code.';

  @override
  String get cvApp => 'Enter the 6-digit code from your authenticator app.';

  @override
  String get cvRecovery => 'Enter one of your recovery codes.';

  @override
  String get cvRecoveryLabel => 'Recovery code';

  @override
  String get cvContactIntro =>
      'Confirm it is you to finish creating your account.';

  @override
  String get cvUnusualIntro =>
      'This sign-in looks different from usual. Enter the code to confirm it is you.';

  @override
  String get cvButton => 'Continue';

  @override
  String get cvUseApp => 'Use my authenticator app';

  @override
  String get cvUseSent => 'Use the code we sent instead';

  @override
  String get cvUseRecovery => 'Use a recovery code';

  @override
  String get cvChallengeGone => 'This step has expired. Start again.';

  @override
  String get cvLocked =>
      'Too many wrong codes. Request a new code to continue.';

  @override
  String get cvWrong => 'That code isn\'t right.';

  @override
  String get epUsernameLocked =>
      'Your username is chosen once and cannot be changed.';

  @override
  String get authSubtitleLive =>
      'Create an account, or sign in to the one you already have.';

  @override
  String get settingsLogoutBodyLive =>
      'You can sign back in any time with your username and password.';

  @override
  String get createPostedLive => 'Your post is live';

  @override
  String get createChangePhoto => 'Change photo';

  @override
  String get createPhotoPreview => 'Preview of your photo';

  @override
  String get createErrRestricted => 'Your account can\'t post right now.';

  @override
  String get createErrRateLimited =>
      'You\'re posting too fast. Wait a moment and try again.';
}
