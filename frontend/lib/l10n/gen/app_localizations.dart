import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_te.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('hi'),
    Locale('te'),
  ];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In en, this message translates to:
  /// **'From Your Block to the World.'**
  String get tagline;

  /// No description provided for @madeInIndia.
  ///
  /// In en, this message translates to:
  /// **'Made in India'**
  String get madeInIndia;

  /// No description provided for @splashLoadingSemantics.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS is loading. Made in India.'**
  String get splashLoadingSemantics;

  /// No description provided for @skip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get skip;

  /// No description provided for @next.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get next;

  /// No description provided for @getStarted.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get getStarted;

  /// No description provided for @exploreDemo.
  ///
  /// In en, this message translates to:
  /// **'Explore Demo'**
  String get exploreDemo;

  /// No description provided for @continueAsDemoUser.
  ///
  /// In en, this message translates to:
  /// **'Continue as Demo User'**
  String get continueAsDemoUser;

  /// No description provided for @pageIndicatorSemantics.
  ///
  /// In en, this message translates to:
  /// **'Page {current} of {total}'**
  String pageIndicatorSemantics(int current, int total);

  /// No description provided for @onboarding1Title.
  ///
  /// In en, this message translates to:
  /// **'Welcome to BLOCKS'**
  String get onboarding1Title;

  /// No description provided for @onboarding1Body.
  ///
  /// In en, this message translates to:
  /// **'Your voice starts local and can reach the world.'**
  String get onboarding1Body;

  /// No description provided for @onboarding2Title.
  ///
  /// In en, this message translates to:
  /// **'From District to the World'**
  String get onboarding2Title;

  /// No description provided for @onboarding2Body.
  ///
  /// In en, this message translates to:
  /// **'Great posts earn their way up through qualified reach, not follower counts.'**
  String get onboarding2Body;

  /// No description provided for @onboarding3Title.
  ///
  /// In en, this message translates to:
  /// **'Create. Share. Grow.'**
  String get onboarding3Title;

  /// No description provided for @onboarding3Body.
  ///
  /// In en, this message translates to:
  /// **'Share posts, reels and stories with your community and watch them travel.'**
  String get onboarding3Body;

  /// No description provided for @onboarding4Title.
  ///
  /// In en, this message translates to:
  /// **'Earn from Your Impact'**
  String get onboarding4Title;

  /// No description provided for @onboarding4Body.
  ///
  /// In en, this message translates to:
  /// **'Rewards follow qualified reach and trust, never raw view counts.'**
  String get onboarding4Body;

  /// No description provided for @onboarding5Title.
  ///
  /// In en, this message translates to:
  /// **'Build Your Business'**
  String get onboarding5Title;

  /// No description provided for @onboarding5Body.
  ///
  /// In en, this message translates to:
  /// **'Create a business page, reach nearby customers and promote what matters.'**
  String get onboarding5Body;

  /// No description provided for @levelDistrict.
  ///
  /// In en, this message translates to:
  /// **'District'**
  String get levelDistrict;

  /// No description provided for @levelState.
  ///
  /// In en, this message translates to:
  /// **'State'**
  String get levelState;

  /// No description provided for @levelNational.
  ///
  /// In en, this message translates to:
  /// **'National'**
  String get levelNational;

  /// No description provided for @levelGlobal.
  ///
  /// In en, this message translates to:
  /// **'Global'**
  String get levelGlobal;

  /// No description provided for @levelBadgeSemantics.
  ///
  /// In en, this message translates to:
  /// **'Reach level {code}, {name}'**
  String levelBadgeSemantics(String code, String name);

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navExplore.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get navExplore;

  /// No description provided for @navCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get navCreate;

  /// No description provided for @navReels.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get navReels;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @authTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to BLOCKS'**
  String get authTitle;

  /// No description provided for @authSubtitle.
  ///
  /// In en, this message translates to:
  /// **'This is a demo experience. No account or internet connection is needed.'**
  String get authSubtitle;

  /// No description provided for @authDemoCardCaption.
  ///
  /// In en, this message translates to:
  /// **'Signing in as the demo creator'**
  String get authDemoCardCaption;

  /// No description provided for @authFootnote.
  ///
  /// In en, this message translates to:
  /// **'Demo data is generated on your device.'**
  String get authFootnote;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get retry;

  /// No description provided for @emptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get emptyTitle;

  /// No description provided for @emptyBody.
  ///
  /// In en, this message translates to:
  /// **'Be the first to create something.'**
  String get emptyBody;

  /// No description provided for @errorTitle.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get errorTitle;

  /// No description provided for @errorBody.
  ///
  /// In en, this message translates to:
  /// **'Please check your connection and try again.'**
  String get errorBody;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading'**
  String get loading;

  /// No description provided for @feedFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get feedFollowing;

  /// No description provided for @feedForYou.
  ///
  /// In en, this message translates to:
  /// **'For You'**
  String get feedForYou;

  /// No description provided for @feedRising.
  ///
  /// In en, this message translates to:
  /// **'Rising'**
  String get feedRising;

  /// No description provided for @feedNearYou.
  ///
  /// In en, this message translates to:
  /// **'Near You'**
  String get feedNearYou;

  /// No description provided for @feedIndia.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get feedIndia;

  /// No description provided for @searchTooltip.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get searchTooltip;

  /// No description provided for @notificationsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTooltip;

  /// No description provided for @profileTooltip.
  ///
  /// In en, this message translates to:
  /// **'Your profile'**
  String get profileTooltip;

  /// No description provided for @messagesTooltip.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get messagesTooltip;

  /// No description provided for @yourStory.
  ///
  /// In en, this message translates to:
  /// **'Your story'**
  String get yourStory;

  /// No description provided for @storyOfSemantics.
  ///
  /// In en, this message translates to:
  /// **'{name}\'s story'**
  String storyOfSemantics(String name);

  /// No description provided for @addToStorySemantics.
  ///
  /// In en, this message translates to:
  /// **'Add to your story'**
  String get addToStorySemantics;

  /// No description provided for @postMoreOptions.
  ///
  /// In en, this message translates to:
  /// **'More options'**
  String get postMoreOptions;

  /// No description provided for @actionLike.
  ///
  /// In en, this message translates to:
  /// **'Like'**
  String get actionLike;

  /// No description provided for @actionUnlike.
  ///
  /// In en, this message translates to:
  /// **'Unlike'**
  String get actionUnlike;

  /// No description provided for @actionComment.
  ///
  /// In en, this message translates to:
  /// **'Comment'**
  String get actionComment;

  /// No description provided for @actionShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get actionShare;

  /// No description provided for @actionSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get actionSave;

  /// No description provided for @actionUnsave.
  ///
  /// In en, this message translates to:
  /// **'Remove from saved'**
  String get actionUnsave;

  /// No description provided for @likeSemantics.
  ///
  /// In en, this message translates to:
  /// **'{label}, {count} likes'**
  String likeSemantics(String label, String count);

  /// No description provided for @commentSemantics.
  ///
  /// In en, this message translates to:
  /// **'Comments, {count}'**
  String commentSemantics(String count);

  /// No description provided for @shareSemantics.
  ///
  /// In en, this message translates to:
  /// **'Share, {count} shares'**
  String shareSemantics(String count);

  /// No description provided for @captionMore.
  ///
  /// In en, this message translates to:
  /// **'more'**
  String get captionMore;

  /// No description provided for @captionLess.
  ///
  /// In en, this message translates to:
  /// **'less'**
  String get captionLess;

  /// No description provided for @postSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved to your collection'**
  String get postSaved;

  /// No description provided for @postUnsaved.
  ///
  /// In en, this message translates to:
  /// **'Removed from saved'**
  String get postUnsaved;

  /// No description provided for @postCardSemantics.
  ///
  /// In en, this message translates to:
  /// **'Post by {name} from {location}'**
  String postCardSemantics(String name, String location);

  /// No description provided for @videoLabel.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get videoLabel;

  /// No description provided for @risingBadge.
  ///
  /// In en, this message translates to:
  /// **'RISING'**
  String get risingBadge;

  /// No description provided for @risingOwn.
  ///
  /// In en, this message translates to:
  /// **'Your post is {percent}% toward {level} level'**
  String risingOwn(int percent, String level);

  /// No description provided for @risingOther.
  ///
  /// In en, this message translates to:
  /// **'This post is {percent}% toward {level} level'**
  String risingOther(int percent, String level);

  /// No description provided for @risingCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get risingCurrent;

  /// No description provided for @risingNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get risingNext;

  /// No description provided for @risingRemaining.
  ///
  /// In en, this message translates to:
  /// **'{count} more qualified interactions needed'**
  String risingRemaining(int count);

  /// No description provided for @risingTopLevel.
  ///
  /// In en, this message translates to:
  /// **'Top of the ladder reached'**
  String get risingTopLevel;

  /// No description provided for @ladderSemantics.
  ///
  /// In en, this message translates to:
  /// **'Reach ladder. {summary}'**
  String ladderSemantics(String summary);

  /// No description provided for @ladderReachedSemantics.
  ///
  /// In en, this message translates to:
  /// **'{level} reached'**
  String ladderReachedSemantics(String level);

  /// No description provided for @ladderProgressSemantics.
  ///
  /// In en, this message translates to:
  /// **'{level} {percent} percent'**
  String ladderProgressSemantics(String level, int percent);

  /// No description provided for @ladderLockedSemantics.
  ///
  /// In en, this message translates to:
  /// **'{level} locked'**
  String ladderLockedSemantics(String level);

  /// No description provided for @reachJourney.
  ///
  /// In en, this message translates to:
  /// **'Reach journey'**
  String get reachJourney;

  /// No description provided for @reachQualifiedLabel.
  ///
  /// In en, this message translates to:
  /// **'Qualified reach'**
  String get reachQualifiedLabel;

  /// No description provided for @reachSimulateBoost.
  ///
  /// In en, this message translates to:
  /// **'Simulate reach boost (demo)'**
  String get reachSimulateBoost;

  /// No description provided for @reachBoostDone.
  ///
  /// In en, this message translates to:
  /// **'Reach boosted for the demo'**
  String get reachBoostDone;

  /// No description provided for @reachExplain.
  ///
  /// In en, this message translates to:
  /// **'Only qualified reach counts: real, distinct viewers and meaningful engagement.'**
  String get reachExplain;

  /// No description provided for @statViews.
  ///
  /// In en, this message translates to:
  /// **'Views'**
  String get statViews;

  /// No description provided for @statLikes.
  ///
  /// In en, this message translates to:
  /// **'Likes'**
  String get statLikes;

  /// No description provided for @statComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get statComments;

  /// No description provided for @statShares.
  ///
  /// In en, this message translates to:
  /// **'Shares'**
  String get statShares;

  /// No description provided for @statSaves.
  ///
  /// In en, this message translates to:
  /// **'Saves'**
  String get statSaves;

  /// No description provided for @levelUnlockedTitle.
  ///
  /// In en, this message translates to:
  /// **'You reached {level} level!'**
  String levelUnlockedTitle(String level);

  /// No description provided for @levelUnlockedBody.
  ///
  /// In en, this message translates to:
  /// **'Your content is now eligible for {level} discovery.'**
  String levelUnlockedBody(String level);

  /// No description provided for @celebrationContinue.
  ///
  /// In en, this message translates to:
  /// **'Awesome'**
  String get celebrationContinue;

  /// No description provided for @commentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get commentsTitle;

  /// No description provided for @commentsHint.
  ///
  /// In en, this message translates to:
  /// **'Add a comment…'**
  String get commentsHint;

  /// No description provided for @commentPost.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get commentPost;

  /// No description provided for @commentsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get commentsEmptyTitle;

  /// No description provided for @commentsEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Start the conversation.'**
  String get commentsEmptyBody;

  /// No description provided for @viewAllComments.
  ///
  /// In en, this message translates to:
  /// **'View all {count} comments'**
  String viewAllComments(String count);

  /// No description provided for @shareTitle.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get shareTitle;

  /// No description provided for @shareSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Every share from a new district helps this post climb.'**
  String get shareSubtitle;

  /// No description provided for @shareCopyLink.
  ///
  /// In en, this message translates to:
  /// **'Copy link'**
  String get shareCopyLink;

  /// No description provided for @shareToStory.
  ///
  /// In en, this message translates to:
  /// **'Add to story'**
  String get shareToStory;

  /// No description provided for @shareInMessage.
  ///
  /// In en, this message translates to:
  /// **'Send in message'**
  String get shareInMessage;

  /// No description provided for @shareMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get shareMore;

  /// No description provided for @linkCopied.
  ///
  /// In en, this message translates to:
  /// **'Link copied'**
  String get linkCopied;

  /// No description provided for @sharedToast.
  ///
  /// In en, this message translates to:
  /// **'Shared'**
  String get sharedToast;

  /// No description provided for @actionReport.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get actionReport;

  /// No description provided for @actionMute.
  ///
  /// In en, this message translates to:
  /// **'Mute {username}'**
  String actionMute(String username);

  /// No description provided for @actionBlock.
  ///
  /// In en, this message translates to:
  /// **'Block {username}'**
  String actionBlock(String username);

  /// No description provided for @actionRestrict.
  ///
  /// In en, this message translates to:
  /// **'Restrict {username}'**
  String actionRestrict(String username);

  /// No description provided for @confirmBlockTitle.
  ///
  /// In en, this message translates to:
  /// **'Block {username}?'**
  String confirmBlockTitle(String username);

  /// No description provided for @confirmBlockBody.
  ///
  /// In en, this message translates to:
  /// **'They won\'t be able to find your profile, and you won\'t see their posts.'**
  String get confirmBlockBody;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @mutedToast.
  ///
  /// In en, this message translates to:
  /// **'{username} muted'**
  String mutedToast(String username);

  /// No description provided for @blockedToast.
  ///
  /// In en, this message translates to:
  /// **'{username} blocked'**
  String blockedToast(String username);

  /// No description provided for @restrictedToast.
  ///
  /// In en, this message translates to:
  /// **'{username} restricted'**
  String restrictedToast(String username);

  /// No description provided for @reportTitle.
  ///
  /// In en, this message translates to:
  /// **'Why are you reporting this?'**
  String get reportTitle;

  /// No description provided for @reportSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your report is confidential.'**
  String get reportSubtitle;

  /// No description provided for @reasonSpam.
  ///
  /// In en, this message translates to:
  /// **'Spam'**
  String get reasonSpam;

  /// No description provided for @reasonHarassment.
  ///
  /// In en, this message translates to:
  /// **'Harassment'**
  String get reasonHarassment;

  /// No description provided for @reasonNudity.
  ///
  /// In en, this message translates to:
  /// **'Nudity / Sexual content'**
  String get reasonNudity;

  /// No description provided for @reasonViolence.
  ///
  /// In en, this message translates to:
  /// **'Violence'**
  String get reasonViolence;

  /// No description provided for @reasonSelfHarm.
  ///
  /// In en, this message translates to:
  /// **'Self-harm'**
  String get reasonSelfHarm;

  /// No description provided for @reasonMisinformation.
  ///
  /// In en, this message translates to:
  /// **'Misinformation'**
  String get reasonMisinformation;

  /// No description provided for @reasonScam.
  ///
  /// In en, this message translates to:
  /// **'Scam / Fraud'**
  String get reasonScam;

  /// No description provided for @reasonOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get reasonOther;

  /// No description provided for @reportDetailsHint.
  ///
  /// In en, this message translates to:
  /// **'Add details (optional)'**
  String get reportDetailsHint;

  /// No description provided for @reportSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit report'**
  String get reportSubmit;

  /// No description provided for @reportThanksTitle.
  ///
  /// In en, this message translates to:
  /// **'Thanks for letting us know'**
  String get reportThanksTitle;

  /// No description provided for @reportThanksBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ll review this against our Community Guidelines.'**
  String get reportThanksBody;

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @timeNow.
  ///
  /// In en, this message translates to:
  /// **'now'**
  String get timeNow;

  /// No description provided for @timeMinutes.
  ///
  /// In en, this message translates to:
  /// **'{n}m'**
  String timeMinutes(int n);

  /// No description provided for @timeHours.
  ///
  /// In en, this message translates to:
  /// **'{n}h'**
  String timeHours(int n);

  /// No description provided for @timeDays.
  ///
  /// In en, this message translates to:
  /// **'{n}d'**
  String timeDays(int n);

  /// No description provided for @timeWeeks.
  ///
  /// In en, this message translates to:
  /// **'{n}w'**
  String timeWeeks(int n);

  /// No description provided for @storyReplyHint.
  ///
  /// In en, this message translates to:
  /// **'Send a message…'**
  String get storyReplyHint;

  /// No description provided for @storyClose.
  ///
  /// In en, this message translates to:
  /// **'Close story'**
  String get storyClose;

  /// No description provided for @storyDemoReaction.
  ///
  /// In en, this message translates to:
  /// **'Reaction sent'**
  String get storyDemoReaction;

  /// No description provided for @promoteTitle.
  ///
  /// In en, this message translates to:
  /// **'Promote your post'**
  String get promoteTitle;

  /// No description provided for @postScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get postScreenTitle;

  /// No description provided for @exploreTitle.
  ///
  /// In en, this message translates to:
  /// **'Explore'**
  String get exploreTitle;

  /// No description provided for @exploreSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search people, places and hashtags'**
  String get exploreSearchHint;

  /// No description provided for @exploreClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get exploreClearSearch;

  /// No description provided for @exploreLocationNote.
  ///
  /// In en, this message translates to:
  /// **'Showing {place}. District-level only, never your exact location.'**
  String exploreLocationNote(String place);

  /// No description provided for @exploreTrendingIn.
  ///
  /// In en, this message translates to:
  /// **'Trending in {place}'**
  String exploreTrendingIn(String place);

  /// No description provided for @exploreTrendPosts.
  ///
  /// In en, this message translates to:
  /// **'{count} posts'**
  String exploreTrendPosts(String count);

  /// No description provided for @exploreCategories.
  ///
  /// In en, this message translates to:
  /// **'Categories'**
  String get exploreCategories;

  /// No description provided for @exploreAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get exploreAll;

  /// No description provided for @placeWorld.
  ///
  /// In en, this message translates to:
  /// **'the world'**
  String get placeWorld;

  /// No description provided for @exploreNoResults.
  ///
  /// In en, this message translates to:
  /// **'No results for “{query}”'**
  String exploreNoResults(String query);

  /// No description provided for @exploreNoResultsBody.
  ///
  /// In en, this message translates to:
  /// **'Try a different name, place or hashtag.'**
  String get exploreNoResultsBody;

  /// No description provided for @exploreResultsPeople.
  ///
  /// In en, this message translates to:
  /// **'People'**
  String get exploreResultsPeople;

  /// No description provided for @exploreResultsHashtags.
  ///
  /// In en, this message translates to:
  /// **'Hashtags'**
  String get exploreResultsHashtags;

  /// No description provided for @exploreResultsPosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get exploreResultsPosts;

  /// No description provided for @catNews.
  ///
  /// In en, this message translates to:
  /// **'News'**
  String get catNews;

  /// No description provided for @catEntertainment.
  ///
  /// In en, this message translates to:
  /// **'Entertainment'**
  String get catEntertainment;

  /// No description provided for @catEducation.
  ///
  /// In en, this message translates to:
  /// **'Education'**
  String get catEducation;

  /// No description provided for @catBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business'**
  String get catBusiness;

  /// No description provided for @catFood.
  ///
  /// In en, this message translates to:
  /// **'Food'**
  String get catFood;

  /// No description provided for @catTravel.
  ///
  /// In en, this message translates to:
  /// **'Travel'**
  String get catTravel;

  /// No description provided for @catTechnology.
  ///
  /// In en, this message translates to:
  /// **'Technology'**
  String get catTechnology;

  /// No description provided for @catSports.
  ///
  /// In en, this message translates to:
  /// **'Sports'**
  String get catSports;

  /// No description provided for @catAgriculture.
  ///
  /// In en, this message translates to:
  /// **'Agriculture'**
  String get catAgriculture;

  /// No description provided for @catFashion.
  ///
  /// In en, this message translates to:
  /// **'Fashion'**
  String get catFashion;

  /// No description provided for @catLocal.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get catLocal;

  /// No description provided for @catJobs.
  ///
  /// In en, this message translates to:
  /// **'Jobs'**
  String get catJobs;

  /// No description provided for @catEvents.
  ///
  /// In en, this message translates to:
  /// **'Events'**
  String get catEvents;

  /// No description provided for @reelMute.
  ///
  /// In en, this message translates to:
  /// **'Mute'**
  String get reelMute;

  /// No description provided for @reelUnmute.
  ///
  /// In en, this message translates to:
  /// **'Unmute'**
  String get reelUnmute;

  /// No description provided for @reelPlay.
  ///
  /// In en, this message translates to:
  /// **'Play'**
  String get reelPlay;

  /// No description provided for @reelPause.
  ///
  /// In en, this message translates to:
  /// **'Pause'**
  String get reelPause;

  /// No description provided for @reelMusic.
  ///
  /// In en, this message translates to:
  /// **'Music: {title}'**
  String reelMusic(String title);

  /// No description provided for @reelCreate.
  ///
  /// In en, this message translates to:
  /// **'Create a reel'**
  String get reelCreate;

  /// No description provided for @actionFollow.
  ///
  /// In en, this message translates to:
  /// **'Follow'**
  String get actionFollow;

  /// No description provided for @actionFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get actionFollowing;

  /// No description provided for @actionMessage.
  ///
  /// In en, this message translates to:
  /// **'Message'**
  String get actionMessage;

  /// No description provided for @createTitle.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get createTitle;

  /// No description provided for @createOptionPost.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get createOptionPost;

  /// No description provided for @createOptionPostBody.
  ///
  /// In en, this message translates to:
  /// **'Share a photo or a text update'**
  String get createOptionPostBody;

  /// No description provided for @createOptionReel.
  ///
  /// In en, this message translates to:
  /// **'Reel'**
  String get createOptionReel;

  /// No description provided for @createOptionReelBody.
  ///
  /// In en, this message translates to:
  /// **'A short vertical video'**
  String get createOptionReelBody;

  /// No description provided for @createOptionStory.
  ///
  /// In en, this message translates to:
  /// **'Story'**
  String get createOptionStory;

  /// No description provided for @createOptionStoryBody.
  ///
  /// In en, this message translates to:
  /// **'Disappears after 24 hours'**
  String get createOptionStoryBody;

  /// No description provided for @createOptionLive.
  ///
  /// In en, this message translates to:
  /// **'Go Live'**
  String get createOptionLive;

  /// No description provided for @createOptionLiveBody.
  ///
  /// In en, this message translates to:
  /// **'For eligible creators'**
  String get createOptionLiveBody;

  /// No description provided for @createPostTitle.
  ///
  /// In en, this message translates to:
  /// **'New post'**
  String get createPostTitle;

  /// No description provided for @createReelTitle.
  ///
  /// In en, this message translates to:
  /// **'New reel'**
  String get createReelTitle;

  /// No description provided for @createStoryTitle.
  ///
  /// In en, this message translates to:
  /// **'New story'**
  String get createStoryTitle;

  /// No description provided for @createTypePhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get createTypePhoto;

  /// No description provided for @createTypeText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get createTypeText;

  /// No description provided for @createPickPhoto.
  ///
  /// In en, this message translates to:
  /// **'Choose a photo'**
  String get createPickPhoto;

  /// No description provided for @createPickVideo.
  ///
  /// In en, this message translates to:
  /// **'Choose a video'**
  String get createPickVideo;

  /// No description provided for @createGalleryNote.
  ///
  /// In en, this message translates to:
  /// **'Demo gallery — in the real app this opens your device gallery.'**
  String get createGalleryNote;

  /// No description provided for @createCaptionLabel.
  ///
  /// In en, this message translates to:
  /// **'Caption'**
  String get createCaptionLabel;

  /// No description provided for @createCaptionHint.
  ///
  /// In en, this message translates to:
  /// **'What\'s happening in your block?'**
  String get createCaptionHint;

  /// No description provided for @createHashtags.
  ///
  /// In en, this message translates to:
  /// **'Suggested hashtags'**
  String get createHashtags;

  /// No description provided for @createLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get createLocation;

  /// No description provided for @createLocationNote.
  ///
  /// In en, this message translates to:
  /// **'District-level only. Your exact location is never shared.'**
  String get createLocationNote;

  /// No description provided for @createChangeLocation.
  ///
  /// In en, this message translates to:
  /// **'Change'**
  String get createChangeLocation;

  /// No description provided for @createSearchDistrict.
  ///
  /// In en, this message translates to:
  /// **'Search districts'**
  String get createSearchDistrict;

  /// No description provided for @createAudience.
  ///
  /// In en, this message translates to:
  /// **'Audience'**
  String get createAudience;

  /// No description provided for @audienceEveryone.
  ///
  /// In en, this message translates to:
  /// **'Everyone'**
  String get audienceEveryone;

  /// No description provided for @audienceFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get audienceFollowers;

  /// No description provided for @audienceCloseFriends.
  ///
  /// In en, this message translates to:
  /// **'Close friends'**
  String get audienceCloseFriends;

  /// No description provided for @createPublish.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get createPublish;

  /// No description provided for @createPublishing.
  ///
  /// In en, this message translates to:
  /// **'Posting…'**
  String get createPublishing;

  /// No description provided for @createPosted.
  ///
  /// In en, this message translates to:
  /// **'Your post is live in {district}'**
  String createPosted(String district);

  /// No description provided for @createReelPosted.
  ///
  /// In en, this message translates to:
  /// **'Your reel is live'**
  String get createReelPosted;

  /// No description provided for @createStoryPosted.
  ///
  /// In en, this message translates to:
  /// **'Added to your story'**
  String get createStoryPosted;

  /// No description provided for @createErrorCaptionTooLong.
  ///
  /// In en, this message translates to:
  /// **'Caption is too long (max 2,200 characters)'**
  String get createErrorCaptionTooLong;

  /// No description provided for @createErrorCaptionRequired.
  ///
  /// In en, this message translates to:
  /// **'Write something to share'**
  String get createErrorCaptionRequired;

  /// No description provided for @createErrorMediaRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a photo or video first'**
  String get createErrorMediaRequired;

  /// No description provided for @createErrorTooManyHashtags.
  ///
  /// In en, this message translates to:
  /// **'Too many hashtags (max 30)'**
  String get createErrorTooManyHashtags;

  /// No description provided for @createErrorLocationRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a location'**
  String get createErrorLocationRequired;

  /// No description provided for @createStartsAt.
  ///
  /// In en, this message translates to:
  /// **'Starts at {level} · {district}'**
  String createStartsAt(String level, String district);

  /// No description provided for @createStartsBody.
  ///
  /// In en, this message translates to:
  /// **'It climbs the Reach Ladder when people across districts engage.'**
  String get createStartsBody;

  /// No description provided for @createMusic.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get createMusic;

  /// No description provided for @createChooseMusic.
  ///
  /// In en, this message translates to:
  /// **'Choose music'**
  String get createChooseMusic;

  /// No description provided for @createCover.
  ///
  /// In en, this message translates to:
  /// **'Cover'**
  String get createCover;

  /// No description provided for @createStoryText.
  ///
  /// In en, this message translates to:
  /// **'Add text to your story'**
  String get createStoryText;

  /// No description provided for @createStoryShare.
  ///
  /// In en, this message translates to:
  /// **'Share to story'**
  String get createStoryShare;

  /// No description provided for @createStoryTextHint.
  ///
  /// In en, this message translates to:
  /// **'Say something…'**
  String get createStoryTextHint;

  /// No description provided for @liveTitle.
  ///
  /// In en, this message translates to:
  /// **'Go Live'**
  String get liveTitle;

  /// No description provided for @liveAccessTitle.
  ///
  /// In en, this message translates to:
  /// **'LIVE ACCESS'**
  String get liveAccessTitle;

  /// No description provided for @liveFollowersRule.
  ///
  /// In en, this message translates to:
  /// **'Followers: {required} required'**
  String liveFollowersRule(int required);

  /// No description provided for @liveFollowersYours.
  ///
  /// In en, this message translates to:
  /// **'Your followers: {current}'**
  String liveFollowersYours(int current);

  /// No description provided for @liveAgeRule.
  ///
  /// In en, this message translates to:
  /// **'Account age: {required} days required'**
  String liveAgeRule(int required);

  /// No description provided for @liveAgeYours.
  ///
  /// In en, this message translates to:
  /// **'Your account: {current} days'**
  String liveAgeYours(int current);

  /// No description provided for @liveTrustRule.
  ///
  /// In en, this message translates to:
  /// **'Trust status'**
  String get liveTrustRule;

  /// No description provided for @liveTrustEligible.
  ///
  /// In en, this message translates to:
  /// **'Eligible'**
  String get liveTrustEligible;

  /// No description provided for @liveTrustReview.
  ///
  /// In en, this message translates to:
  /// **'Under review'**
  String get liveTrustReview;

  /// No description provided for @liveTrustRestricted.
  ///
  /// In en, this message translates to:
  /// **'Restricted'**
  String get liveTrustRestricted;

  /// No description provided for @liveTwoFactorRule.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication'**
  String get liveTwoFactorRule;

  /// No description provided for @liveEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enabled'**
  String get liveEnabled;

  /// No description provided for @liveNotEnabled.
  ///
  /// In en, this message translates to:
  /// **'Not enabled'**
  String get liveNotEnabled;

  /// No description provided for @liveViolationRule.
  ///
  /// In en, this message translates to:
  /// **'No major violations'**
  String get liveViolationRule;

  /// No description provided for @liveAgeRuleEligible.
  ///
  /// In en, this message translates to:
  /// **'Age eligibility'**
  String get liveAgeRuleEligible;

  /// No description provided for @liveMet.
  ///
  /// In en, this message translates to:
  /// **'Met'**
  String get liveMet;

  /// No description provided for @liveNotMet.
  ///
  /// In en, this message translates to:
  /// **'Not met'**
  String get liveNotMet;

  /// No description provided for @liveGranted.
  ///
  /// In en, this message translates to:
  /// **'LIVE ACCESS GRANTED'**
  String get liveGranted;

  /// No description provided for @liveGrantedBody.
  ///
  /// In en, this message translates to:
  /// **'You meet every requirement. Live streaming is not available in this demo.'**
  String get liveGrantedBody;

  /// No description provided for @liveNotYet.
  ///
  /// In en, this message translates to:
  /// **'Not eligible yet'**
  String get liveNotYet;

  /// No description provided for @liveNotYetBody.
  ///
  /// In en, this message translates to:
  /// **'Complete the requirements below to unlock Live.'**
  String get liveNotYetBody;

  /// No description provided for @liveEnableTwoFactor.
  ///
  /// In en, this message translates to:
  /// **'Turn on two-factor authentication'**
  String get liveEnableTwoFactor;

  /// No description provided for @liveStart.
  ///
  /// In en, this message translates to:
  /// **'Start live'**
  String get liveStart;

  /// No description provided for @liveRequirementMet.
  ///
  /// In en, this message translates to:
  /// **'Requirement met'**
  String get liveRequirementMet;

  /// No description provided for @liveRequirementNotMet.
  ///
  /// In en, this message translates to:
  /// **'Requirement not met'**
  String get liveRequirementNotMet;

  /// No description provided for @profilePosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get profilePosts;

  /// No description provided for @profileFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get profileFollowers;

  /// No description provided for @profileFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get profileFollowing;

  /// No description provided for @profileTabPosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get profileTabPosts;

  /// No description provided for @profileTabReels.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get profileTabReels;

  /// No description provided for @profileTabTagged.
  ///
  /// In en, this message translates to:
  /// **'Tagged'**
  String get profileTabTagged;

  /// No description provided for @profileReachLevel.
  ///
  /// In en, this message translates to:
  /// **'Reach level'**
  String get profileReachLevel;

  /// No description provided for @profileLevelLine.
  ///
  /// In en, this message translates to:
  /// **'{code} — {level}'**
  String profileLevelLine(String code, String level);

  /// No description provided for @profileShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get profileShare;

  /// No description provided for @profileMenu.
  ///
  /// In en, this message translates to:
  /// **'Menu'**
  String get profileMenu;

  /// No description provided for @profileCreatorStudio.
  ///
  /// In en, this message translates to:
  /// **'Creator Studio'**
  String get profileCreatorStudio;

  /// No description provided for @profileBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business profile'**
  String get profileBusiness;

  /// No description provided for @profileVerification.
  ///
  /// In en, this message translates to:
  /// **'Verification'**
  String get profileVerification;

  /// No description provided for @profileSafetyCenter.
  ///
  /// In en, this message translates to:
  /// **'Safety Center'**
  String get profileSafetyCenter;

  /// No description provided for @profileSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get profileSettings;

  /// No description provided for @profileMessages.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get profileMessages;

  /// No description provided for @profileBestPost.
  ///
  /// In en, this message translates to:
  /// **'Based on your best post'**
  String get profileBestPost;

  /// No description provided for @verifiedIdentity.
  ///
  /// In en, this message translates to:
  /// **'Verified Identity'**
  String get verifiedIdentity;

  /// No description provided for @verifiedBusiness.
  ///
  /// In en, this message translates to:
  /// **'Verified Business'**
  String get verifiedBusiness;

  /// No description provided for @verifiedCreator.
  ///
  /// In en, this message translates to:
  /// **'Verified Creator'**
  String get verifiedCreator;

  /// No description provided for @verifiedPublisher.
  ///
  /// In en, this message translates to:
  /// **'Verified Publisher'**
  String get verifiedPublisher;

  /// No description provided for @backTooltip.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get backTooltip;

  /// No description provided for @studioTitle.
  ///
  /// In en, this message translates to:
  /// **'Creator Studio'**
  String get studioTitle;

  /// No description provided for @studioSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Reach, growth and earnings at a glance'**
  String get studioSubtitle;

  /// No description provided for @studioEstimatedEarnings.
  ///
  /// In en, this message translates to:
  /// **'Estimated earnings'**
  String get studioEstimatedEarnings;

  /// No description provided for @studioEarningsNote.
  ///
  /// In en, this message translates to:
  /// **'Estimates come from qualified reach and can change after quality checks. Demo values, not a payout promise.'**
  String get studioEarningsNote;

  /// No description provided for @studioFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get studioFollowers;

  /// No description provided for @studioQualifiedReach.
  ///
  /// In en, this message translates to:
  /// **'Qualified reach'**
  String get studioQualifiedReach;

  /// No description provided for @studioLast30.
  ///
  /// In en, this message translates to:
  /// **'Last 30 days'**
  String get studioLast30;

  /// No description provided for @studioLevelReach.
  ///
  /// In en, this message translates to:
  /// **'{level} reach'**
  String studioLevelReach(String level);

  /// No description provided for @studioReachPerformance.
  ///
  /// In en, this message translates to:
  /// **'Reach performance'**
  String get studioReachPerformance;

  /// No description provided for @studioReachPerformanceBody.
  ///
  /// In en, this message translates to:
  /// **'How much of your audience footprint each level covers.'**
  String get studioReachPerformanceBody;

  /// No description provided for @studioNextMilestone.
  ///
  /// In en, this message translates to:
  /// **'Next milestone'**
  String get studioNextMilestone;

  /// No description provided for @studioMilestoneProgress.
  ///
  /// In en, this message translates to:
  /// **'{percent}% complete'**
  String studioMilestoneProgress(int percent);

  /// No description provided for @studioMilestoneBody.
  ///
  /// In en, this message translates to:
  /// **'Keep growing your cross-state audience.'**
  String get studioMilestoneBody;

  /// No description provided for @studioMilestoneTop.
  ///
  /// In en, this message translates to:
  /// **'You are at the top of the ladder. Keep the momentum going.'**
  String get studioMilestoneTop;

  /// No description provided for @studioTopPosts.
  ///
  /// In en, this message translates to:
  /// **'Top posts'**
  String get studioTopPosts;

  /// No description provided for @studioOpenPost.
  ///
  /// In en, this message translates to:
  /// **'Open post'**
  String get studioOpenPost;

  /// No description provided for @businessLabel.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS Business'**
  String get businessLabel;

  /// No description provided for @businessTabPosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get businessTabPosts;

  /// No description provided for @businessTabReels.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get businessTabReels;

  /// No description provided for @businessTabOffers.
  ///
  /// In en, this message translates to:
  /// **'Offers'**
  String get businessTabOffers;

  /// No description provided for @businessTabAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get businessTabAbout;

  /// No description provided for @businessFollowers.
  ///
  /// In en, this message translates to:
  /// **'{count} followers'**
  String businessFollowers(String count);

  /// No description provided for @businessContact.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get businessContact;

  /// No description provided for @businessPromote.
  ///
  /// In en, this message translates to:
  /// **'Promote'**
  String get businessPromote;

  /// No description provided for @businessCall.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get businessCall;

  /// No description provided for @businessWhatsApp.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp'**
  String get businessWhatsApp;

  /// No description provided for @businessWebsite.
  ///
  /// In en, this message translates to:
  /// **'Website'**
  String get businessWebsite;

  /// No description provided for @businessCopied.
  ///
  /// In en, this message translates to:
  /// **'{what} copied'**
  String businessCopied(String what);

  /// No description provided for @businessHours.
  ///
  /// In en, this message translates to:
  /// **'Opening hours'**
  String get businessHours;

  /// No description provided for @businessCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get businessCategory;

  /// No description provided for @businessLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get businessLocation;

  /// No description provided for @businessOfferCode.
  ///
  /// In en, this message translates to:
  /// **'Code: {code}'**
  String businessOfferCode(String code);

  /// No description provided for @businessOfferValid.
  ///
  /// In en, this message translates to:
  /// **'Valid until {date}'**
  String businessOfferValid(String date);

  /// No description provided for @businessCopyCode.
  ///
  /// In en, this message translates to:
  /// **'Copy code'**
  String get businessCopyCode;

  /// No description provided for @businessAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get businessAbout;

  /// No description provided for @promoteStepOf.
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total}'**
  String promoteStepOf(int current, int total);

  /// No description provided for @promoteStepPost.
  ///
  /// In en, this message translates to:
  /// **'Select post'**
  String get promoteStepPost;

  /// No description provided for @promoteStepGoal.
  ///
  /// In en, this message translates to:
  /// **'Choose a goal'**
  String get promoteStepGoal;

  /// No description provided for @promoteStepAudience.
  ///
  /// In en, this message translates to:
  /// **'Select audience'**
  String get promoteStepAudience;

  /// No description provided for @promoteStepLocation.
  ///
  /// In en, this message translates to:
  /// **'Select location'**
  String get promoteStepLocation;

  /// No description provided for @promoteStepBudget.
  ///
  /// In en, this message translates to:
  /// **'Set budget'**
  String get promoteStepBudget;

  /// No description provided for @promoteStepReview.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get promoteStepReview;

  /// No description provided for @promoteStepPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get promoteStepPublish;

  /// No description provided for @goalFollowers.
  ///
  /// In en, this message translates to:
  /// **'More followers'**
  String get goalFollowers;

  /// No description provided for @goalFollowersBody.
  ///
  /// In en, this message translates to:
  /// **'Grow your audience with people likely to follow.'**
  String get goalFollowersBody;

  /// No description provided for @goalReach.
  ///
  /// In en, this message translates to:
  /// **'More reach'**
  String get goalReach;

  /// No description provided for @goalReachBody.
  ///
  /// In en, this message translates to:
  /// **'Show your post to as many people as possible.'**
  String get goalReachBody;

  /// No description provided for @goalWebsite.
  ///
  /// In en, this message translates to:
  /// **'Website visits'**
  String get goalWebsite;

  /// No description provided for @goalWebsiteBody.
  ///
  /// In en, this message translates to:
  /// **'Send people to your website.'**
  String get goalWebsiteBody;

  /// No description provided for @goalContact.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp / Contact'**
  String get goalContact;

  /// No description provided for @goalContactBody.
  ///
  /// In en, this message translates to:
  /// **'Get calls and WhatsApp messages.'**
  String get goalContactBody;

  /// No description provided for @goalVideoViews.
  ///
  /// In en, this message translates to:
  /// **'Video views'**
  String get goalVideoViews;

  /// No description provided for @goalVideoViewsBody.
  ///
  /// In en, this message translates to:
  /// **'Get more people to watch your video.'**
  String get goalVideoViewsBody;

  /// No description provided for @promoteAudienceNote.
  ///
  /// In en, this message translates to:
  /// **'We target interest groups. Personal details are never shared with advertisers.'**
  String get promoteAudienceNote;

  /// No description provided for @promoteInterests.
  ///
  /// In en, this message translates to:
  /// **'Interests'**
  String get promoteInterests;

  /// No description provided for @promoteLocationsHint.
  ///
  /// In en, this message translates to:
  /// **'Where should your post be shown? Pick one or more districts.'**
  String get promoteLocationsHint;

  /// No description provided for @promoteAddDistrict.
  ///
  /// In en, this message translates to:
  /// **'Add district'**
  String get promoteAddDistrict;

  /// No description provided for @promoteDailyBudget.
  ///
  /// In en, this message translates to:
  /// **'Daily budget'**
  String get promoteDailyBudget;

  /// No description provided for @promoteDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get promoteDuration;

  /// No description provided for @promoteDays.
  ///
  /// In en, this message translates to:
  /// **'{n} days'**
  String promoteDays(int n);

  /// No description provided for @promoteTotal.
  ///
  /// In en, this message translates to:
  /// **'Total budget'**
  String get promoteTotal;

  /// No description provided for @promoteEstimatedReach.
  ///
  /// In en, this message translates to:
  /// **'Estimated reach'**
  String get promoteEstimatedReach;

  /// No description provided for @promoteReachRange.
  ///
  /// In en, this message translates to:
  /// **'{min} – {max} people'**
  String promoteReachRange(String min, String max);

  /// No description provided for @promoteDemoBanner.
  ///
  /// In en, this message translates to:
  /// **'Demo campaign. No real money is processed.'**
  String get promoteDemoBanner;

  /// No description provided for @promoteContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get promoteContinue;

  /// No description provided for @promoteBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get promoteBack;

  /// No description provided for @promotePublish.
  ///
  /// In en, this message translates to:
  /// **'Publish demo campaign'**
  String get promotePublish;

  /// No description provided for @promoteSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Demo campaign created'**
  String get promoteSuccessTitle;

  /// No description provided for @promoteSuccessBody.
  ///
  /// In en, this message translates to:
  /// **'In the real app your post would now start reaching new people. No money was charged.'**
  String get promoteSuccessBody;

  /// No description provided for @promoteDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get promoteDone;

  /// No description provided for @promoteReviewPost.
  ///
  /// In en, this message translates to:
  /// **'Post'**
  String get promoteReviewPost;

  /// No description provided for @promoteReviewGoal.
  ///
  /// In en, this message translates to:
  /// **'Goal'**
  String get promoteReviewGoal;

  /// No description provided for @promoteReviewAudience.
  ///
  /// In en, this message translates to:
  /// **'Audience'**
  String get promoteReviewAudience;

  /// No description provided for @promoteReviewLocation.
  ///
  /// In en, this message translates to:
  /// **'Locations'**
  String get promoteReviewLocation;

  /// No description provided for @promoteReviewBudget.
  ///
  /// In en, this message translates to:
  /// **'Budget'**
  String get promoteReviewBudget;

  /// No description provided for @promoteNoPosts.
  ///
  /// In en, this message translates to:
  /// **'Create a post first, then promote it.'**
  String get promoteNoPosts;

  /// No description provided for @campErrPost.
  ///
  /// In en, this message translates to:
  /// **'Select a post to promote'**
  String get campErrPost;

  /// No description provided for @campErrGoal.
  ///
  /// In en, this message translates to:
  /// **'Choose a goal'**
  String get campErrGoal;

  /// No description provided for @campErrLocation.
  ///
  /// In en, this message translates to:
  /// **'Pick at least one location'**
  String get campErrLocation;

  /// No description provided for @campErrBudgetLow.
  ///
  /// In en, this message translates to:
  /// **'Minimum daily budget is ₹100'**
  String get campErrBudgetLow;

  /// No description provided for @campErrBudgetHigh.
  ///
  /// In en, this message translates to:
  /// **'Maximum daily budget is ₹50,000'**
  String get campErrBudgetHigh;

  /// No description provided for @campErrDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration must be 1 to 30 days'**
  String get campErrDuration;

  /// No description provided for @notifTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifTitle;

  /// No description provided for @notifMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get notifMarkAllRead;

  /// No description provided for @notifAllMarked.
  ///
  /// In en, this message translates to:
  /// **'All notifications marked as read'**
  String get notifAllMarked;

  /// No description provided for @notifAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get notifAll;

  /// No description provided for @notifCatLikes.
  ///
  /// In en, this message translates to:
  /// **'Likes'**
  String get notifCatLikes;

  /// No description provided for @notifCatComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get notifCatComments;

  /// No description provided for @notifCatFollowers.
  ///
  /// In en, this message translates to:
  /// **'New followers'**
  String get notifCatFollowers;

  /// No description provided for @notifCatShares.
  ///
  /// In en, this message translates to:
  /// **'Shares'**
  String get notifCatShares;

  /// No description provided for @notifCatReach.
  ///
  /// In en, this message translates to:
  /// **'Reach levels'**
  String get notifCatReach;

  /// No description provided for @notifCatEarnings.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get notifCatEarnings;

  /// No description provided for @notifCatBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business'**
  String get notifCatBusiness;

  /// No description provided for @notifCatSafety.
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get notifCatSafety;

  /// No description provided for @notifUnread.
  ///
  /// In en, this message translates to:
  /// **'Unread'**
  String get notifUnread;

  /// No description provided for @notifEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'You\'re all caught up'**
  String get notifEmptyTitle;

  /// No description provided for @notifEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'New activity will show up here.'**
  String get notifEmptyBody;

  /// No description provided for @messagesTitle.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get messagesTitle;

  /// No description provided for @messagesSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search conversations'**
  String get messagesSearchHint;

  /// No description provided for @messagesEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No conversations yet'**
  String get messagesEmptyTitle;

  /// No description provided for @messagesEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Start one from someone\'s profile.'**
  String get messagesEmptyBody;

  /// No description provided for @messagesNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No conversations match “{query}”'**
  String messagesNoMatch(String query);

  /// No description provided for @chatOnline.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get chatOnline;

  /// No description provided for @chatOffline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get chatOffline;

  /// No description provided for @chatMessageHint.
  ///
  /// In en, this message translates to:
  /// **'Message…'**
  String get chatMessageHint;

  /// No description provided for @chatSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get chatSend;

  /// No description provided for @chatAttach.
  ///
  /// In en, this message translates to:
  /// **'Attach photo'**
  String get chatAttach;

  /// No description provided for @chatVoice.
  ///
  /// In en, this message translates to:
  /// **'Record voice message'**
  String get chatVoice;

  /// No description provided for @chatPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get chatPhoto;

  /// No description provided for @chatVoiceMessage.
  ///
  /// In en, this message translates to:
  /// **'Voice message, {duration}'**
  String chatVoiceMessage(String duration);

  /// No description provided for @chatUnavailableDemo.
  ///
  /// In en, this message translates to:
  /// **'Not available in this demo'**
  String get chatUnavailableDemo;

  /// No description provided for @chatEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Say hello'**
  String get chatEmptyTitle;

  /// No description provided for @chatEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Messages you send will appear here.'**
  String get chatEmptyBody;

  /// No description provided for @conversationUnread.
  ///
  /// In en, this message translates to:
  /// **'{count} unread'**
  String conversationUnread(String count);

  /// No description provided for @verifyTitle.
  ///
  /// In en, this message translates to:
  /// **'Verification'**
  String get verifyTitle;

  /// No description provided for @verifyStatusTitle.
  ///
  /// In en, this message translates to:
  /// **'Verification status'**
  String get verifyStatusTitle;

  /// No description provided for @verifyStatusNone.
  ///
  /// In en, this message translates to:
  /// **'Not verified'**
  String get verifyStatusNone;

  /// No description provided for @verifyStatusPending.
  ///
  /// In en, this message translates to:
  /// **'Pending review'**
  String get verifyStatusPending;

  /// No description provided for @verifyStatusVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get verifyStatusVerified;

  /// No description provided for @verifyStatusRejected.
  ///
  /// In en, this message translates to:
  /// **'Not approved'**
  String get verifyStatusRejected;

  /// No description provided for @verifyIntro.
  ///
  /// In en, this message translates to:
  /// **'Badges are earned, never bought. Each has clear eligibility rules and can be revoked.'**
  String get verifyIntro;

  /// No description provided for @verifyBodyIdentity.
  ///
  /// In en, this message translates to:
  /// **'Confirms you are a real person using an approved ID check.'**
  String get verifyBodyIdentity;

  /// No description provided for @verifyBodyBusiness.
  ///
  /// In en, this message translates to:
  /// **'Confirms a business or organisation is genuine.'**
  String get verifyBodyBusiness;

  /// No description provided for @verifyBodyCreator.
  ///
  /// In en, this message translates to:
  /// **'Recognises sustained, original and compliant creators.'**
  String get verifyBodyCreator;

  /// No description provided for @verifyBodyPublisher.
  ///
  /// In en, this message translates to:
  /// **'For news and media organisations that cite sources and publish corrections.'**
  String get verifyBodyPublisher;

  /// No description provided for @verifyRequest.
  ///
  /// In en, this message translates to:
  /// **'Request'**
  String get verifyRequest;

  /// No description provided for @verifyRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get verifyRequested;

  /// No description provided for @verifyCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current badge'**
  String get verifyCurrent;

  /// No description provided for @verifySubmitted.
  ///
  /// In en, this message translates to:
  /// **'Verification requested'**
  String get verifySubmitted;

  /// No description provided for @verifyDemoAdminTitle.
  ///
  /// In en, this message translates to:
  /// **'Demo admin'**
  String get verifyDemoAdminTitle;

  /// No description provided for @verifyDemoAdminBody.
  ///
  /// In en, this message translates to:
  /// **'In the real app a trust team reviews your request. In this demo you can approve it yourself.'**
  String get verifyDemoAdminBody;

  /// No description provided for @verifyApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve (demo)'**
  String get verifyApprove;

  /// No description provided for @verifyApproved.
  ///
  /// In en, this message translates to:
  /// **'You\'re verified'**
  String get verifyApproved;

  /// No description provided for @safetyTitle.
  ///
  /// In en, this message translates to:
  /// **'Safety Center'**
  String get safetyTitle;

  /// No description provided for @safetyIntro.
  ///
  /// In en, this message translates to:
  /// **'Tools to control who can reach you and what you see.'**
  String get safetyIntro;

  /// No description provided for @safetySectionReport.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get safetySectionReport;

  /// No description provided for @safetyReportContent.
  ///
  /// In en, this message translates to:
  /// **'Report content or a problem'**
  String get safetyReportContent;

  /// No description provided for @safetyReportContentBody.
  ///
  /// In en, this message translates to:
  /// **'You can also tap the three dots on any post, reel or profile.'**
  String get safetyReportContentBody;

  /// No description provided for @safetySectionPeople.
  ///
  /// In en, this message translates to:
  /// **'People'**
  String get safetySectionPeople;

  /// No description provided for @safetyBlocked.
  ///
  /// In en, this message translates to:
  /// **'Blocked accounts'**
  String get safetyBlocked;

  /// No description provided for @safetyMuted.
  ///
  /// In en, this message translates to:
  /// **'Muted accounts'**
  String get safetyMuted;

  /// No description provided for @safetyRestricted.
  ///
  /// In en, this message translates to:
  /// **'Restricted accounts'**
  String get safetyRestricted;

  /// No description provided for @safetyRestrictedBody.
  ///
  /// In en, this message translates to:
  /// **'Restricted people can\'t see when you are active. Restrict someone from their profile menu.'**
  String get safetyRestrictedBody;

  /// No description provided for @safetySectionControls.
  ///
  /// In en, this message translates to:
  /// **'Controls'**
  String get safetySectionControls;

  /// No description provided for @safetySensitive.
  ///
  /// In en, this message translates to:
  /// **'Sensitive content'**
  String get safetySensitive;

  /// No description provided for @safetySensitiveBody.
  ///
  /// In en, this message translates to:
  /// **'Choose how much sensitive content appears in your feeds.'**
  String get safetySensitiveBody;

  /// No description provided for @safetySensitiveLess.
  ///
  /// In en, this message translates to:
  /// **'Less'**
  String get safetySensitiveLess;

  /// No description provided for @safetySensitiveStandard.
  ///
  /// In en, this message translates to:
  /// **'Standard'**
  String get safetySensitiveStandard;

  /// No description provided for @safetySensitiveMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get safetySensitiveMore;

  /// No description provided for @safetyComments.
  ///
  /// In en, this message translates to:
  /// **'Who can comment'**
  String get safetyComments;

  /// No description provided for @safetyMessages.
  ///
  /// In en, this message translates to:
  /// **'Who can message you'**
  String get safetyMessages;

  /// No description provided for @safetyEveryone.
  ///
  /// In en, this message translates to:
  /// **'Everyone'**
  String get safetyEveryone;

  /// No description provided for @safetyFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get safetyFollowers;

  /// No description provided for @safetyNobody.
  ///
  /// In en, this message translates to:
  /// **'No one'**
  String get safetyNobody;

  /// No description provided for @safetyPrivateAccount.
  ///
  /// In en, this message translates to:
  /// **'Private account'**
  String get safetyPrivateAccount;

  /// No description provided for @safetyPrivateAccountBody.
  ///
  /// In en, this message translates to:
  /// **'Only approved followers can see your posts.'**
  String get safetyPrivateAccountBody;

  /// No description provided for @safetySectionSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get safetySectionSecurity;

  /// No description provided for @safetyTwoFactor.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication'**
  String get safetyTwoFactor;

  /// No description provided for @safetyTwoFactorBody.
  ///
  /// In en, this message translates to:
  /// **'Adds a second step when you sign in. Required for Live.'**
  String get safetyTwoFactorBody;

  /// No description provided for @safetyLoginSecurity.
  ///
  /// In en, this message translates to:
  /// **'Login security'**
  String get safetyLoginSecurity;

  /// No description provided for @safetyLoginBody.
  ///
  /// In en, this message translates to:
  /// **'This device · {place} · active now'**
  String safetyLoginBody(String place);

  /// No description provided for @safetyLoginAlerts.
  ///
  /// In en, this message translates to:
  /// **'Alert me about new sign-ins'**
  String get safetyLoginAlerts;

  /// No description provided for @blockedTitle.
  ///
  /// In en, this message translates to:
  /// **'Blocked accounts'**
  String get blockedTitle;

  /// No description provided for @mutedTitle.
  ///
  /// In en, this message translates to:
  /// **'Muted accounts'**
  String get mutedTitle;

  /// No description provided for @blockedEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'People you block can\'t find your profile.'**
  String get blockedEmptyBody;

  /// No description provided for @mutedEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Muted people\'s posts are hidden from your feeds.'**
  String get mutedEmptyBody;

  /// No description provided for @unblock.
  ///
  /// In en, this message translates to:
  /// **'Unblock'**
  String get unblock;

  /// No description provided for @unmute.
  ///
  /// In en, this message translates to:
  /// **'Unmute'**
  String get unmute;

  /// No description provided for @unblockedToast.
  ///
  /// In en, this message translates to:
  /// **'{username} unblocked'**
  String unblockedToast(String username);

  /// No description provided for @unmutedToast.
  ///
  /// In en, this message translates to:
  /// **'{username} unmuted'**
  String unmutedToast(String username);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsSectionAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get settingsSectionAccount;

  /// No description provided for @settingsSectionPreferences.
  ///
  /// In en, this message translates to:
  /// **'Preferences'**
  String get settingsSectionPreferences;

  /// No description provided for @settingsSectionSupport.
  ///
  /// In en, this message translates to:
  /// **'Support'**
  String get settingsSectionSupport;

  /// No description provided for @settingsAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearance;

  /// No description provided for @themeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get themeDark;

  /// No description provided for @settingsAccount.
  ///
  /// In en, this message translates to:
  /// **'Account details'**
  String get settingsAccount;

  /// No description provided for @settingsPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get settingsPrivacy;

  /// No description provided for @settingsSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get settingsSecurity;

  /// No description provided for @settingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotifications;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguage;

  /// No description provided for @settingsLanguageSystem.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get settingsLanguageSystem;

  /// No description provided for @settingsContent.
  ///
  /// In en, this message translates to:
  /// **'Content preferences'**
  String get settingsContent;

  /// No description provided for @settingsCreator.
  ///
  /// In en, this message translates to:
  /// **'Creator settings'**
  String get settingsCreator;

  /// No description provided for @settingsBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business settings'**
  String get settingsBusiness;

  /// No description provided for @settingsHelp.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get settingsHelp;

  /// No description provided for @settingsGuidelines.
  ///
  /// In en, this message translates to:
  /// **'Community guidelines'**
  String get settingsGuidelines;

  /// No description provided for @settingsPrivacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get settingsPrivacyPolicy;

  /// No description provided for @settingsTerms.
  ///
  /// In en, this message translates to:
  /// **'Terms of service'**
  String get settingsTerms;

  /// No description provided for @settingsLogout.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get settingsLogout;

  /// No description provided for @settingsLogoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out of BLOCKS?'**
  String get settingsLogoutTitle;

  /// No description provided for @settingsLogoutBody.
  ///
  /// In en, this message translates to:
  /// **'You can sign back in as the demo user any time.'**
  String get settingsLogoutBody;

  /// No description provided for @settingsDemoMode.
  ///
  /// In en, this message translates to:
  /// **'Demo mode · all data is generated on this device'**
  String get settingsDemoMode;

  /// No description provided for @settingsAccountName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get settingsAccountName;

  /// No description provided for @settingsAccountUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get settingsAccountUsername;

  /// No description provided for @settingsAccountLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get settingsAccountLocation;

  /// No description provided for @settingsAccountAge.
  ///
  /// In en, this message translates to:
  /// **'Time on BLOCKS'**
  String get settingsAccountAge;

  /// No description provided for @settingsAccountDays.
  ///
  /// In en, this message translates to:
  /// **'{days} days'**
  String settingsAccountDays(String days);

  /// No description provided for @prefNotifLikes.
  ///
  /// In en, this message translates to:
  /// **'Likes'**
  String get prefNotifLikes;

  /// No description provided for @prefNotifComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get prefNotifComments;

  /// No description provided for @prefNotifFollowers.
  ///
  /// In en, this message translates to:
  /// **'New followers'**
  String get prefNotifFollowers;

  /// No description provided for @prefNotifReach.
  ///
  /// In en, this message translates to:
  /// **'Reach level unlocks'**
  String get prefNotifReach;

  /// No description provided for @prefNotifEarnings.
  ///
  /// In en, this message translates to:
  /// **'Creator earnings'**
  String get prefNotifEarnings;

  /// No description provided for @prefNotifBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business activity'**
  String get prefNotifBusiness;

  /// No description provided for @prefNotifSafety.
  ///
  /// In en, this message translates to:
  /// **'Safety and security'**
  String get prefNotifSafety;

  /// No description provided for @prefAlwaysOn.
  ///
  /// In en, this message translates to:
  /// **'Always on'**
  String get prefAlwaysOn;

  /// No description provided for @prefAutoplay.
  ///
  /// In en, this message translates to:
  /// **'Autoplay videos'**
  String get prefAutoplay;

  /// No description provided for @prefDataSaver.
  ///
  /// In en, this message translates to:
  /// **'Data saver'**
  String get prefDataSaver;

  /// No description provided for @prefDataSaverBody.
  ///
  /// In en, this message translates to:
  /// **'Loads smaller images and limits preloading.'**
  String get prefDataSaverBody;

  /// No description provided for @prefShowReachBadge.
  ///
  /// In en, this message translates to:
  /// **'Show Reach Level on my profile'**
  String get prefShowReachBadge;

  /// No description provided for @prefCreatorEarnings.
  ///
  /// In en, this message translates to:
  /// **'Show earnings in Creator Studio'**
  String get prefCreatorEarnings;

  /// No description provided for @prefWeeklySummary.
  ///
  /// In en, this message translates to:
  /// **'Weekly performance summary'**
  String get prefWeeklySummary;

  /// No description provided for @prefBusinessAutoReply.
  ///
  /// In en, this message translates to:
  /// **'Auto-reply to messages'**
  String get prefBusinessAutoReply;

  /// No description provided for @prefBusinessContact.
  ///
  /// In en, this message translates to:
  /// **'Show Contact button'**
  String get prefBusinessContact;

  /// No description provided for @prefOpenBusiness.
  ///
  /// In en, this message translates to:
  /// **'Open business profile'**
  String get prefOpenBusiness;

  /// No description provided for @infoGuidelinesTitle.
  ///
  /// In en, this message translates to:
  /// **'Community guidelines'**
  String get infoGuidelinesTitle;

  /// No description provided for @infoGuidelinesBody.
  ///
  /// In en, this message translates to:
  /// **'# Be real\nShare your own work and say when content is AI-generated or taken from a source.\n\n# Be kind\nNo harassment, hate or threats. Disagree without attacking people.\n\n# Keep it safe\nNo sexual exploitation, graphic violence, self-harm promotion, scams or illegal goods. Content involving minors is removed immediately.\n\n# Earn reach fairly\nFake engagement, bots and view manipulation are not allowed. Reach Levels count qualified viewers only.\n\n# Appeals\nIf we remove something you can appeal and a person will review it.'**
  String get infoGuidelinesBody;

  /// No description provided for @infoPrivacyTitle.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get infoPrivacyTitle;

  /// No description provided for @infoPrivacyBody.
  ///
  /// In en, this message translates to:
  /// **'# What we collect\nOnly what BLOCKS needs: your profile, your posts and your district — never your exact GPS location.\n\n# What we never do\nWe do not sell your personal data. Advertisers reach interest groups, not individuals.\n\n# Your controls\nUse Safety Center and Settings to control privacy, messages and notifications. You can request your data or delete your account.\n\n# Payments and identity\nPayout and identity details are stored separately from your public profile.\n\n# Demo note\nThis is summary copy for the prototype, not a legal policy.'**
  String get infoPrivacyBody;

  /// No description provided for @infoTermsTitle.
  ///
  /// In en, this message translates to:
  /// **'Terms of service'**
  String get infoTermsTitle;

  /// No description provided for @infoTermsBody.
  ///
  /// In en, this message translates to:
  /// **'# Using BLOCKS\nYou must be old enough to use social media in your country and follow the Community Guidelines.\n\n# Your content\nYou own what you post and let BLOCKS show it to other people.\n\n# Creator rewards\nRewards come from a pool shared by qualified reach. They are estimates until finalised and are never a promise of a rupee amount per view.\n\n# Demo note\nThis is summary copy for the prototype, not legal terms.'**
  String get infoTermsBody;

  /// No description provided for @infoHelpTitle.
  ///
  /// In en, this message translates to:
  /// **'Help & support'**
  String get infoHelpTitle;

  /// No description provided for @infoHelpBody.
  ///
  /// In en, this message translates to:
  /// **'# How do Reach Levels work?\nPosts climb District, State, National and Global as real people in more places engage with them.\n\n# Why is my post still at District level?\nOnly qualified views count. Open the Rising tab to see how close it is.\n\n# How do I get verified?\nOpen Profile, then Menu, then Verification and request a badge.\n\n# How do I report something?\nTap the three dots on a post, reel or profile and choose Report.\n\n# Need a person?\nThis is a demo, so there is no live support.'**
  String get infoHelpBody;

  /// No description provided for @reelsTabForYou.
  ///
  /// In en, this message translates to:
  /// **'For You'**
  String get reelsTabForYou;

  /// No description provided for @reelsTabFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get reelsTabFollowing;

  /// No description provided for @reelsFollowingEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No reels from people you follow yet'**
  String get reelsFollowingEmptyTitle;

  /// No description provided for @reelsFollowingEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Follow creators to see their reels here.'**
  String get reelsFollowingEmptyBody;

  /// No description provided for @reelsFeedSemantics.
  ///
  /// In en, this message translates to:
  /// **'Reels feed'**
  String get reelsFeedSemantics;

  /// No description provided for @prefReelsSound.
  ///
  /// In en, this message translates to:
  /// **'Reels sound'**
  String get prefReelsSound;

  /// No description provided for @prefReelsSoundBody.
  ///
  /// In en, this message translates to:
  /// **'Reels always start muted in a new session.'**
  String get prefReelsSoundBody;

  /// No description provided for @secAlertEmail.
  ///
  /// In en, this message translates to:
  /// **'Security alerts by email'**
  String get secAlertEmail;

  /// No description provided for @secAlertPush.
  ///
  /// In en, this message translates to:
  /// **'Security alerts on my devices'**
  String get secAlertPush;

  /// No description provided for @secAlertNewDevice.
  ///
  /// In en, this message translates to:
  /// **'New device sign-in alerts'**
  String get secAlertNewDevice;

  /// No description provided for @notifCatSecurity.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get notifCatSecurity;

  /// No description provided for @secTitle.
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get secTitle;

  /// No description provided for @secStatusProtected.
  ///
  /// In en, this message translates to:
  /// **'Your account is protected'**
  String get secStatusProtected;

  /// No description provided for @secStatusAttention.
  ///
  /// In en, this message translates to:
  /// **'Your account needs attention'**
  String get secStatusAttention;

  /// No description provided for @secStatusBody2faOn.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication is on and nothing unusual was found.'**
  String get secStatusBody2faOn;

  /// No description provided for @secStatusBody2faOff.
  ///
  /// In en, this message translates to:
  /// **'Turn on two-factor authentication to protect your account.'**
  String get secStatusBody2faOff;

  /// No description provided for @secStatusBodySuspicious.
  ///
  /// In en, this message translates to:
  /// **'We found a suspicious sign-in. Review it now.'**
  String get secStatusBodySuspicious;

  /// No description provided for @secLastSignIn.
  ///
  /// In en, this message translates to:
  /// **'Last sign-in: {when}'**
  String secLastSignIn(String when);

  /// No description provided for @secSectionAccount.
  ///
  /// In en, this message translates to:
  /// **'Account security'**
  String get secSectionAccount;

  /// No description provided for @secSectionDemo.
  ///
  /// In en, this message translates to:
  /// **'Demo'**
  String get secSectionDemo;

  /// No description provided for @secChangePassword.
  ///
  /// In en, this message translates to:
  /// **'Change Password'**
  String get secChangePassword;

  /// No description provided for @secChangeEmail.
  ///
  /// In en, this message translates to:
  /// **'Change Email'**
  String get secChangeEmail;

  /// No description provided for @secChangePhone.
  ///
  /// In en, this message translates to:
  /// **'Change Phone Number'**
  String get secChangePhone;

  /// No description provided for @secTwoFactor.
  ///
  /// In en, this message translates to:
  /// **'Two-Factor Authentication'**
  String get secTwoFactor;

  /// No description provided for @secLoginActivity.
  ///
  /// In en, this message translates to:
  /// **'Login Activity'**
  String get secLoginActivity;

  /// No description provided for @secDevices.
  ///
  /// In en, this message translates to:
  /// **'Logged-in Devices'**
  String get secDevices;

  /// No description provided for @secLogoutOthers.
  ///
  /// In en, this message translates to:
  /// **'Log Out From All Other Devices'**
  String get secLogoutOthers;

  /// No description provided for @secNotifications.
  ///
  /// In en, this message translates to:
  /// **'Security Notifications'**
  String get secNotifications;

  /// No description provided for @secOn.
  ///
  /// In en, this message translates to:
  /// **'On'**
  String get secOn;

  /// No description provided for @secOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get secOff;

  /// No description provided for @secDevicesCount.
  ///
  /// In en, this message translates to:
  /// **'{n} devices'**
  String secDevicesCount(int n);

  /// No description provided for @secLogoutOthersTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out of all other devices?'**
  String get secLogoutOthersTitle;

  /// No description provided for @secLogoutOthersBody.
  ///
  /// In en, this message translates to:
  /// **'This will end BLOCKS sessions on every device except this one.'**
  String get secLogoutOthersBody;

  /// No description provided for @secLogoutOthersConfirm.
  ///
  /// In en, this message translates to:
  /// **'Log Out Others'**
  String get secLogoutOthersConfirm;

  /// No description provided for @secLogoutOthersDone.
  ///
  /// In en, this message translates to:
  /// **'Logged out of all other devices'**
  String get secLogoutOthersDone;

  /// No description provided for @secDemoLab.
  ///
  /// In en, this message translates to:
  /// **'Security demo lab'**
  String get secDemoLab;

  /// No description provided for @secDemoLabBody.
  ///
  /// In en, this message translates to:
  /// **'Simulate sign-in attacks, alerts and device changes.'**
  String get secDemoLabBody;

  /// No description provided for @secReviewNeeded.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get secReviewNeeded;

  /// No description provided for @secFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'This field is required'**
  String get secFieldRequired;

  /// No description provided for @secPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get secPasswordLabel;

  /// No description provided for @cpTitle.
  ///
  /// In en, this message translates to:
  /// **'Change Password'**
  String get cpTitle;

  /// No description provided for @cpIntro.
  ///
  /// In en, this message translates to:
  /// **'Choose a strong password you don\'t use anywhere else.'**
  String get cpIntro;

  /// No description provided for @cpCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get cpCurrent;

  /// No description provided for @cpNew.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get cpNew;

  /// No description provided for @cpConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm new password'**
  String get cpConfirm;

  /// No description provided for @cpShow.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get cpShow;

  /// No description provided for @cpHide.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get cpHide;

  /// No description provided for @cpStrength.
  ///
  /// In en, this message translates to:
  /// **'Password strength'**
  String get cpStrength;

  /// No description provided for @cpStrengthWeak.
  ///
  /// In en, this message translates to:
  /// **'Weak'**
  String get cpStrengthWeak;

  /// No description provided for @cpStrengthFair.
  ///
  /// In en, this message translates to:
  /// **'Fair'**
  String get cpStrengthFair;

  /// No description provided for @cpStrengthStrong.
  ///
  /// In en, this message translates to:
  /// **'Strong'**
  String get cpStrengthStrong;

  /// No description provided for @cpStrengthVeryStrong.
  ///
  /// In en, this message translates to:
  /// **'Very strong'**
  String get cpStrengthVeryStrong;

  /// No description provided for @cpRuleMinLength.
  ///
  /// In en, this message translates to:
  /// **'At least {n} characters'**
  String cpRuleMinLength(int n);

  /// No description provided for @cpRuleUpper.
  ///
  /// In en, this message translates to:
  /// **'An uppercase letter (A-Z)'**
  String get cpRuleUpper;

  /// No description provided for @cpRuleLower.
  ///
  /// In en, this message translates to:
  /// **'A lowercase letter (a-z)'**
  String get cpRuleLower;

  /// No description provided for @cpRuleDigit.
  ///
  /// In en, this message translates to:
  /// **'A number (0-9)'**
  String get cpRuleDigit;

  /// No description provided for @cpRuleSpecial.
  ///
  /// In en, this message translates to:
  /// **'A special character (! @ # ...)'**
  String get cpRuleSpecial;

  /// No description provided for @cpMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords don\'t match'**
  String get cpMismatch;

  /// No description provided for @cpSubmit.
  ///
  /// In en, this message translates to:
  /// **'Change Password'**
  String get cpSubmit;

  /// No description provided for @cpForgot.
  ///
  /// In en, this message translates to:
  /// **'Forgot your current password?'**
  String get cpForgot;

  /// No description provided for @cpSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Password Changed'**
  String get cpSuccessTitle;

  /// No description provided for @cpSuccessBody.
  ///
  /// In en, this message translates to:
  /// **'Your BLOCKS password has been updated successfully.'**
  String get cpSuccessBody;

  /// No description provided for @cpErrorTitle.
  ///
  /// In en, this message translates to:
  /// **'Unable to change password.'**
  String get cpErrorTitle;

  /// No description provided for @cpErrorBody.
  ///
  /// In en, this message translates to:
  /// **'Please verify your current password and try again.'**
  String get cpErrorBody;

  /// No description provided for @cpErrWeak.
  ///
  /// In en, this message translates to:
  /// **'The new password doesn\'t meet the requirements.'**
  String get cpErrWeak;

  /// No description provided for @cpErrSame.
  ///
  /// In en, this message translates to:
  /// **'Your new password must be different from the current one.'**
  String get cpErrSame;

  /// No description provided for @devTitle.
  ///
  /// In en, this message translates to:
  /// **'Your Devices'**
  String get devTitle;

  /// No description provided for @devActiveNow.
  ///
  /// In en, this message translates to:
  /// **'Active now'**
  String get devActiveNow;

  /// No description provided for @devCurrentBadge.
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get devCurrentBadge;

  /// No description provided for @devLogOut.
  ///
  /// In en, this message translates to:
  /// **'Log Out'**
  String get devLogOut;

  /// No description provided for @devLogOutTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out of this device?'**
  String get devLogOutTitle;

  /// No description provided for @devLogOutBody.
  ///
  /// In en, this message translates to:
  /// **'{device} will be signed out of BLOCKS.'**
  String devLogOutBody(String device);

  /// No description provided for @devLoggedOut.
  ///
  /// In en, this message translates to:
  /// **'Device logged out'**
  String get devLoggedOut;

  /// No description provided for @devEmpty.
  ///
  /// In en, this message translates to:
  /// **'No other devices are signed in.'**
  String get devEmpty;

  /// No description provided for @devOnPlatform.
  ///
  /// In en, this message translates to:
  /// **'{app} on {platform}'**
  String devOnPlatform(String app, String platform);

  /// No description provided for @actTitle.
  ///
  /// In en, this message translates to:
  /// **'Login Activity'**
  String get actTitle;

  /// No description provided for @actFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get actFilterAll;

  /// No description provided for @actFilterSuccessful.
  ///
  /// In en, this message translates to:
  /// **'Successful'**
  String get actFilterSuccessful;

  /// No description provided for @actFilterFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get actFilterFailed;

  /// No description provided for @actFilterSuspicious.
  ///
  /// In en, this message translates to:
  /// **'Suspicious'**
  String get actFilterSuspicious;

  /// No description provided for @actToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get actToday;

  /// No description provided for @actYesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get actYesterday;

  /// No description provided for @actEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No activity to show'**
  String get actEmptyTitle;

  /// No description provided for @actEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Nothing matches this filter.'**
  String get actEmptyBody;

  /// No description provided for @evLoginSuccess.
  ///
  /// In en, this message translates to:
  /// **'Successful Login'**
  String get evLoginSuccess;

  /// No description provided for @evLoginFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed Login Attempt'**
  String get evLoginFailed;

  /// No description provided for @evSuspicious.
  ///
  /// In en, this message translates to:
  /// **'Suspicious Login Attempt'**
  String get evSuspicious;

  /// No description provided for @evPasswordChanged.
  ///
  /// In en, this message translates to:
  /// **'Password Changed'**
  String get evPasswordChanged;

  /// No description provided for @evEmailChanged.
  ///
  /// In en, this message translates to:
  /// **'Email Changed'**
  String get evEmailChanged;

  /// No description provided for @evPhoneChanged.
  ///
  /// In en, this message translates to:
  /// **'Phone Number Changed'**
  String get evPhoneChanged;

  /// No description provided for @evTwoFactorOn.
  ///
  /// In en, this message translates to:
  /// **'Two-Factor Authentication Enabled'**
  String get evTwoFactorOn;

  /// No description provided for @evTwoFactorOff.
  ///
  /// In en, this message translates to:
  /// **'Two-Factor Authentication Disabled'**
  String get evTwoFactorOff;

  /// No description provided for @evSessionRevoked.
  ///
  /// In en, this message translates to:
  /// **'Device Logged Out'**
  String get evSessionRevoked;

  /// No description provided for @evAttempts.
  ///
  /// In en, this message translates to:
  /// **'{n} failed attempts'**
  String evAttempts(int n);

  /// No description provided for @evReviewed.
  ///
  /// In en, this message translates to:
  /// **'Reviewed'**
  String get evReviewed;

  /// No description provided for @tfTitle.
  ///
  /// In en, this message translates to:
  /// **'Two-Factor Authentication'**
  String get tfTitle;

  /// No description provided for @tfIntro.
  ///
  /// In en, this message translates to:
  /// **'Add a second step when you sign in, so a stolen password isn\'t enough.'**
  String get tfIntro;

  /// No description provided for @tfStatusOn.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication is on'**
  String get tfStatusOn;

  /// No description provided for @tfStatusOff.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication is off'**
  String get tfStatusOff;

  /// No description provided for @tfMethod.
  ///
  /// In en, this message translates to:
  /// **'Verification method'**
  String get tfMethod;

  /// No description provided for @tfSms.
  ///
  /// In en, this message translates to:
  /// **'Text message (SMS)'**
  String get tfSms;

  /// No description provided for @tfSmsBody.
  ///
  /// In en, this message translates to:
  /// **'Codes are sent to {phone}'**
  String tfSmsBody(String phone);

  /// No description provided for @tfAuthenticator.
  ///
  /// In en, this message translates to:
  /// **'Authenticator app'**
  String get tfAuthenticator;

  /// No description provided for @tfAuthenticatorBody.
  ///
  /// In en, this message translates to:
  /// **'Use an app like Google Authenticator or Authy.'**
  String get tfAuthenticatorBody;

  /// No description provided for @tfEmailFallback.
  ///
  /// In en, this message translates to:
  /// **'Email fallback'**
  String get tfEmailFallback;

  /// No description provided for @tfEmailFallbackBody.
  ///
  /// In en, this message translates to:
  /// **'If you can\'t get a code, we can send one to your email.'**
  String get tfEmailFallbackBody;

  /// No description provided for @tfEnable.
  ///
  /// In en, this message translates to:
  /// **'Turn on'**
  String get tfEnable;

  /// No description provided for @tfDisable.
  ///
  /// In en, this message translates to:
  /// **'Turn off'**
  String get tfDisable;

  /// No description provided for @tfChooseMethod.
  ///
  /// In en, this message translates to:
  /// **'Choose how to get codes'**
  String get tfChooseMethod;

  /// No description provided for @tfCodeSentTo.
  ///
  /// In en, this message translates to:
  /// **'We sent a code to {dest}.'**
  String tfCodeSentTo(String dest);

  /// No description provided for @tfAuthSetup.
  ///
  /// In en, this message translates to:
  /// **'Open your authenticator app and enter the code shown for BLOCKS.'**
  String get tfAuthSetup;

  /// No description provided for @tfVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify and turn on'**
  String get tfVerify;

  /// No description provided for @tfEnabledToast.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication is on'**
  String get tfEnabledToast;

  /// No description provided for @tfDisableTitle.
  ///
  /// In en, this message translates to:
  /// **'Turn off two-factor authentication?'**
  String get tfDisableTitle;

  /// No description provided for @tfDisableBody.
  ///
  /// In en, this message translates to:
  /// **'Your account will only be protected by your password. Enter it to confirm.'**
  String get tfDisableBody;

  /// No description provided for @tfDisabledToast.
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication is off'**
  String get tfDisabledToast;

  /// No description provided for @tfDemoNote.
  ///
  /// In en, this message translates to:
  /// **'Demo: no real SMS or authenticator app is used.'**
  String get tfDemoNote;

  /// No description provided for @otpEnterCode.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get otpEnterCode;

  /// No description provided for @otpLabel.
  ///
  /// In en, this message translates to:
  /// **'{n}-digit code'**
  String otpLabel(int n);

  /// No description provided for @otpDemoHint.
  ///
  /// In en, this message translates to:
  /// **'Demo OTP: {code}'**
  String otpDemoHint(String code);

  /// No description provided for @otpDemoNotice.
  ///
  /// In en, this message translates to:
  /// **'Demo only. A real build never shows the code on screen.'**
  String get otpDemoNotice;

  /// No description provided for @otpResend.
  ///
  /// In en, this message translates to:
  /// **'Resend code'**
  String get otpResend;

  /// No description provided for @otpResendIn.
  ///
  /// In en, this message translates to:
  /// **'Resend in {seconds}s'**
  String otpResendIn(int seconds);

  /// No description provided for @otpResent.
  ///
  /// In en, this message translates to:
  /// **'A new code was sent'**
  String get otpResent;

  /// No description provided for @otpIncorrect.
  ///
  /// In en, this message translates to:
  /// **'That code isn\'t right. {attempts} attempts left.'**
  String otpIncorrect(int attempts);

  /// No description provided for @otpExpired.
  ///
  /// In en, this message translates to:
  /// **'This code has expired. Request a new one.'**
  String get otpExpired;

  /// No description provided for @otpLocked.
  ///
  /// In en, this message translates to:
  /// **'Too many wrong codes. Try again after {time}.'**
  String otpLocked(String time);

  /// No description provided for @snTitle.
  ///
  /// In en, this message translates to:
  /// **'Security Notifications'**
  String get snTitle;

  /// No description provided for @snIntro.
  ///
  /// In en, this message translates to:
  /// **'Choose how BLOCKS alerts you about account activity.'**
  String get snIntro;

  /// No description provided for @snCritical.
  ///
  /// In en, this message translates to:
  /// **'Suspicious sign-ins and account changes'**
  String get snCritical;

  /// No description provided for @snCriticalBody.
  ///
  /// In en, this message translates to:
  /// **'Always on. We always alert you when a sign-in looks suspicious or your password, email or phone changes.'**
  String get snCriticalBody;

  /// No description provided for @snSentTitle.
  ///
  /// In en, this message translates to:
  /// **'Alerts sent to your email'**
  String get snSentTitle;

  /// No description provided for @snSentEmpty.
  ///
  /// In en, this message translates to:
  /// **'No security emails have been sent yet.'**
  String get snSentEmpty;

  /// No description provided for @snSentTo.
  ///
  /// In en, this message translates to:
  /// **'Sent to {email}'**
  String snSentTo(String email);

  /// No description provided for @snDemoNote.
  ///
  /// In en, this message translates to:
  /// **'Demo: emails are simulated and only listed here.'**
  String get snDemoNote;

  /// No description provided for @alertSuspiciousTitle.
  ///
  /// In en, this message translates to:
  /// **'Suspicious Login Attempt'**
  String get alertSuspiciousTitle;

  /// No description provided for @alertSuspiciousBody.
  ///
  /// In en, this message translates to:
  /// **'We detected multiple unsuccessful login attempts on your BLOCKS account.'**
  String get alertSuspiciousBody;

  /// No description provided for @alertNewDeviceTitle.
  ///
  /// In en, this message translates to:
  /// **'New Device Sign-in'**
  String get alertNewDeviceTitle;

  /// No description provided for @alertNewDeviceBody.
  ///
  /// In en, this message translates to:
  /// **'A new device signed in to your BLOCKS account.'**
  String get alertNewDeviceBody;

  /// No description provided for @alertDevice.
  ///
  /// In en, this message translates to:
  /// **'Device'**
  String get alertDevice;

  /// No description provided for @alertLocation.
  ///
  /// In en, this message translates to:
  /// **'Approximate location'**
  String get alertLocation;

  /// No description provided for @alertTime.
  ///
  /// In en, this message translates to:
  /// **'Time'**
  String get alertTime;

  /// No description provided for @alertIfYou.
  ///
  /// In en, this message translates to:
  /// **'If this was you'**
  String get alertIfYou;

  /// No description provided for @alertIfYouBody.
  ///
  /// In en, this message translates to:
  /// **'You don\'t need to do anything.'**
  String get alertIfYouBody;

  /// No description provided for @alertIfNotYou.
  ///
  /// In en, this message translates to:
  /// **'If this wasn\'t you'**
  String get alertIfNotYou;

  /// No description provided for @alertIfNotYouBody.
  ///
  /// In en, this message translates to:
  /// **'Change your password and review your logged-in devices.'**
  String get alertIfNotYouBody;

  /// No description provided for @alertSecure.
  ///
  /// In en, this message translates to:
  /// **'Secure Account'**
  String get alertSecure;

  /// No description provided for @alertReview.
  ///
  /// In en, this message translates to:
  /// **'Review Devices'**
  String get alertReview;

  /// No description provided for @alertWasMe.
  ///
  /// In en, this message translates to:
  /// **'This Was Me'**
  String get alertWasMe;

  /// No description provided for @alertAcknowledged.
  ///
  /// In en, this message translates to:
  /// **'Thanks. We\'ve marked this as you.'**
  String get alertAcknowledged;

  /// No description provided for @alertSent.
  ///
  /// In en, this message translates to:
  /// **'Security Alert Sent'**
  String get alertSent;

  /// No description provided for @alertSentBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ve sent a security notification to your registered email and active BLOCKS devices.'**
  String get alertSentBody;

  /// No description provided for @alertPrivacyNote.
  ///
  /// In en, this message translates to:
  /// **'For your privacy we only show an approximate location.'**
  String get alertPrivacyNote;

  /// No description provided for @cpRuleMet.
  ///
  /// In en, this message translates to:
  /// **'met'**
  String get cpRuleMet;

  /// No description provided for @cpRuleNotMet.
  ///
  /// In en, this message translates to:
  /// **'not met yet'**
  String get cpRuleNotMet;

  /// No description provided for @otpDemoFill.
  ///
  /// In en, this message translates to:
  /// **'Tap to fill the code.'**
  String get otpDemoFill;

  /// No description provided for @tfWrongPassword.
  ///
  /// In en, this message translates to:
  /// **'That password isn\'t right.'**
  String get tfWrongPassword;

  /// No description provided for @authSignInPassword.
  ///
  /// In en, this message translates to:
  /// **'Sign in with password'**
  String get authSignInPassword;

  /// No description provided for @siTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome back'**
  String get siTitle;

  /// No description provided for @siSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to your BLOCKS account.'**
  String get siSubtitle;

  /// No description provided for @siIdentifier.
  ///
  /// In en, this message translates to:
  /// **'Email, phone or username'**
  String get siIdentifier;

  /// No description provided for @siButton.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get siButton;

  /// No description provided for @siForgot.
  ///
  /// In en, this message translates to:
  /// **'Forgot password?'**
  String get siForgot;

  /// No description provided for @siInvalid.
  ///
  /// In en, this message translates to:
  /// **'Incorrect email, phone or password.'**
  String get siInvalid;

  /// No description provided for @siAttemptsLeft.
  ///
  /// In en, this message translates to:
  /// **'{n} attempts left before your account is temporarily protected.'**
  String siAttemptsLeft(int n);

  /// No description provided for @siProtectedTitle.
  ///
  /// In en, this message translates to:
  /// **'Account temporarily protected'**
  String get siProtectedTitle;

  /// No description provided for @siProtectedAttempts.
  ///
  /// In en, this message translates to:
  /// **'{n} failed login attempts detected.'**
  String siProtectedAttempts(int n);

  /// No description provided for @siProtectedBody.
  ///
  /// In en, this message translates to:
  /// **'Your account has been temporarily protected.'**
  String get siProtectedBody;

  /// No description provided for @siProtectedAdvice.
  ///
  /// In en, this message translates to:
  /// **'If this wasn\'t you, secure your account immediately.'**
  String get siProtectedAdvice;

  /// No description provided for @siProtectedUntil.
  ///
  /// In en, this message translates to:
  /// **'You can try again after {time}.'**
  String siProtectedUntil(String time);

  /// No description provided for @siResetPassword.
  ///
  /// In en, this message translates to:
  /// **'Reset password'**
  String get siResetPassword;

  /// No description provided for @siDemoCard.
  ///
  /// In en, this message translates to:
  /// **'Demo account'**
  String get siDemoCard;

  /// No description provided for @siDemoPassword.
  ///
  /// In en, this message translates to:
  /// **'Password: {password}'**
  String siDemoPassword(String password);

  /// No description provided for @siDemoFill.
  ///
  /// In en, this message translates to:
  /// **'Tap to fill in the demo sign-in.'**
  String get siDemoFill;

  /// No description provided for @labIntro.
  ///
  /// In en, this message translates to:
  /// **'Run security scenarios on the demo server to show alerts, protection and device changes. Nothing here exists in a real build.'**
  String get labIntro;

  /// No description provided for @labStatus.
  ///
  /// In en, this message translates to:
  /// **'What the server sees'**
  String get labStatus;

  /// No description provided for @labFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed sign-ins: {n} of {total}'**
  String labFailed(int n, int total);

  /// No description provided for @labNotProtected.
  ///
  /// In en, this message translates to:
  /// **'Sign-in is not restricted'**
  String get labNotProtected;

  /// No description provided for @labProtectedUntil.
  ///
  /// In en, this message translates to:
  /// **'Sign-in is protected until {time}'**
  String labProtectedUntil(String time);

  /// No description provided for @labEmails.
  ///
  /// In en, this message translates to:
  /// **'Security emails sent: {n}'**
  String labEmails(int n);

  /// No description provided for @labDevices.
  ///
  /// In en, this message translates to:
  /// **'Active devices: {n}'**
  String labDevices(int n);

  /// No description provided for @labPhotoArmed.
  ///
  /// In en, this message translates to:
  /// **'The next profile photo upload will fail'**
  String get labPhotoArmed;

  /// No description provided for @labRun.
  ///
  /// In en, this message translates to:
  /// **'Run'**
  String get labRun;

  /// No description provided for @labReset.
  ///
  /// In en, this message translates to:
  /// **'Reset demo data'**
  String get labReset;

  /// No description provided for @labResetDone.
  ///
  /// In en, this message translates to:
  /// **'Demo security data reset'**
  String get labResetDone;

  /// No description provided for @labOpenAlert.
  ///
  /// In en, this message translates to:
  /// **'Open the alert'**
  String get labOpenAlert;

  /// No description provided for @labTrySignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign out and try the sign-in screen'**
  String get labTrySignIn;

  /// No description provided for @labNormalTitle.
  ///
  /// In en, this message translates to:
  /// **'Normal login'**
  String get labNormalTitle;

  /// No description provided for @labNormalBody.
  ///
  /// In en, this message translates to:
  /// **'A successful sign-in from this device. No alert.'**
  String get labNormalBody;

  /// No description provided for @labWrongTitle.
  ///
  /// In en, this message translates to:
  /// **'Wrong password'**
  String get labWrongTitle;

  /// No description provided for @labWrongBody.
  ///
  /// In en, this message translates to:
  /// **'One failed sign-in. Repeat it to watch the attempt counter.'**
  String get labWrongBody;

  /// No description provided for @labMaxTitle.
  ///
  /// In en, this message translates to:
  /// **'Maximum failed attempts'**
  String get labMaxTitle;

  /// No description provided for @labMaxBody.
  ///
  /// In en, this message translates to:
  /// **'Reaches the limit: protection starts, and an event, notification and email are created.'**
  String get labMaxBody;

  /// No description provided for @labSuspiciousTitle.
  ///
  /// In en, this message translates to:
  /// **'Suspicious login notification'**
  String get labSuspiciousTitle;

  /// No description provided for @labSuspiciousBody.
  ///
  /// In en, this message translates to:
  /// **'A sign-in attempt from an unknown device raises the alert.'**
  String get labSuspiciousBody;

  /// No description provided for @labPasswordTitle.
  ///
  /// In en, this message translates to:
  /// **'Password changed'**
  String get labPasswordTitle;

  /// No description provided for @labPasswordBody.
  ///
  /// In en, this message translates to:
  /// **'Records the change and sends the alert (your password stays the same).'**
  String get labPasswordBody;

  /// No description provided for @labNewDeviceTitle.
  ///
  /// In en, this message translates to:
  /// **'New device login'**
  String get labNewDeviceTitle;

  /// No description provided for @labNewDeviceBody.
  ///
  /// In en, this message translates to:
  /// **'A new phone appears in your devices with a New Login alert.'**
  String get labNewDeviceBody;

  /// No description provided for @labRevokedTitle.
  ///
  /// In en, this message translates to:
  /// **'Session revoked'**
  String get labRevokedTitle;

  /// No description provided for @labRevokedBody.
  ///
  /// In en, this message translates to:
  /// **'Another device is logged out, with a Device Removed alert.'**
  String get labRevokedBody;

  /// No description provided for @labPhotoTitle.
  ///
  /// In en, this message translates to:
  /// **'Photo upload fails'**
  String get labPhotoTitle;

  /// No description provided for @labPhotoBody.
  ///
  /// In en, this message translates to:
  /// **'The next profile photo upload fails so you can see the error and retry.'**
  String get labPhotoBody;

  /// No description provided for @fpTitle.
  ///
  /// In en, this message translates to:
  /// **'Forgot Password'**
  String get fpTitle;

  /// No description provided for @fpStep.
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total}'**
  String fpStep(int current, int total);

  /// No description provided for @fpChooseTitle.
  ///
  /// In en, this message translates to:
  /// **'How should we verify you?'**
  String get fpChooseTitle;

  /// No description provided for @fpChooseBody.
  ///
  /// In en, this message translates to:
  /// **'Pick where we should send your verification code.'**
  String get fpChooseBody;

  /// No description provided for @fpViaEmail.
  ///
  /// In en, this message translates to:
  /// **'Reset password using Email'**
  String get fpViaEmail;

  /// No description provided for @fpViaPhone.
  ///
  /// In en, this message translates to:
  /// **'Reset password using Phone'**
  String get fpViaPhone;

  /// No description provided for @fpEmailBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ll send a verification code to your email.'**
  String get fpEmailBody;

  /// No description provided for @fpPhoneBody.
  ///
  /// In en, this message translates to:
  /// **'We\'ll text a verification code to your phone.'**
  String get fpPhoneBody;

  /// No description provided for @fpEmailLabel.
  ///
  /// In en, this message translates to:
  /// **'Email address'**
  String get fpEmailLabel;

  /// No description provided for @fpPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get fpPhoneLabel;

  /// No description provided for @fpSendCode.
  ///
  /// In en, this message translates to:
  /// **'Send Verification Code'**
  String get fpSendCode;

  /// No description provided for @fpSendOtp.
  ///
  /// In en, this message translates to:
  /// **'Send OTP'**
  String get fpSendOtp;

  /// No description provided for @fpVerifyCode.
  ///
  /// In en, this message translates to:
  /// **'Verify Code'**
  String get fpVerifyCode;

  /// No description provided for @fpNewTitle.
  ///
  /// In en, this message translates to:
  /// **'Create a new password'**
  String get fpNewTitle;

  /// No description provided for @fpNewBody.
  ///
  /// In en, this message translates to:
  /// **'Choose a strong password you haven\'t used before.'**
  String get fpNewBody;

  /// No description provided for @fpSave.
  ///
  /// In en, this message translates to:
  /// **'Reset Password'**
  String get fpSave;

  /// No description provided for @fpDoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Password Changed Successfully'**
  String get fpDoneTitle;

  /// No description provided for @fpDoneBody.
  ///
  /// In en, this message translates to:
  /// **'You can now sign in with your new password.'**
  String get fpDoneBody;

  /// No description provided for @fpDoneBodyInApp.
  ///
  /// In en, this message translates to:
  /// **'Your password is updated and your other devices were signed out for your safety.'**
  String get fpDoneBodyInApp;

  /// No description provided for @fpBackToSignIn.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get fpBackToSignIn;

  /// No description provided for @fpErrEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address.'**
  String get fpErrEmail;

  /// No description provided for @fpErrPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid 10-digit mobile number.'**
  String get fpErrPhone;

  /// No description provided for @fpTooMany.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please try again later.'**
  String get fpTooMany;

  /// No description provided for @fpExpired.
  ///
  /// In en, this message translates to:
  /// **'This verification expired. Please start again.'**
  String get fpExpired;

  /// No description provided for @fpDemoAny.
  ///
  /// In en, this message translates to:
  /// **'Demo: any valid email or phone number works.'**
  String get fpDemoAny;

  /// No description provided for @ccCurrentEmail.
  ///
  /// In en, this message translates to:
  /// **'Current email'**
  String get ccCurrentEmail;

  /// No description provided for @ccCurrentPhone.
  ///
  /// In en, this message translates to:
  /// **'Current phone number'**
  String get ccCurrentPhone;

  /// No description provided for @ccNewEmail.
  ///
  /// In en, this message translates to:
  /// **'New email address'**
  String get ccNewEmail;

  /// No description provided for @ccNewPhone.
  ///
  /// In en, this message translates to:
  /// **'New phone number'**
  String get ccNewPhone;

  /// No description provided for @ccPasswordHint.
  ///
  /// In en, this message translates to:
  /// **'For your security, enter your password to continue.'**
  String get ccPasswordHint;

  /// No description provided for @ccSendCode.
  ///
  /// In en, this message translates to:
  /// **'Send Verification Code'**
  String get ccSendCode;

  /// No description provided for @ccConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm the change'**
  String get ccConfirmTitle;

  /// No description provided for @ccConfirmBodyEmail.
  ///
  /// In en, this message translates to:
  /// **'Your BLOCKS email will change to {value}.'**
  String ccConfirmBodyEmail(String value);

  /// No description provided for @ccConfirmBodyPhone.
  ///
  /// In en, this message translates to:
  /// **'Your BLOCKS phone number will change to {value}.'**
  String ccConfirmBodyPhone(String value);

  /// No description provided for @ccConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get ccConfirm;

  /// No description provided for @ccDoneEmailTitle.
  ///
  /// In en, this message translates to:
  /// **'Email Updated'**
  String get ccDoneEmailTitle;

  /// No description provided for @ccDoneEmailBody.
  ///
  /// In en, this message translates to:
  /// **'We sent an alert to your previous address so you know it was you.'**
  String get ccDoneEmailBody;

  /// No description provided for @ccDonePhoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Phone Number Updated'**
  String get ccDonePhoneTitle;

  /// No description provided for @ccDonePhoneBody.
  ///
  /// In en, this message translates to:
  /// **'Your new number is now on your account.'**
  String get ccDonePhoneBody;

  /// No description provided for @ccErrSameEmail.
  ///
  /// In en, this message translates to:
  /// **'That is already your current email.'**
  String get ccErrSameEmail;

  /// No description provided for @ccErrSamePhone.
  ///
  /// In en, this message translates to:
  /// **'That is already your current phone number.'**
  String get ccErrSamePhone;

  /// No description provided for @epTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Profile'**
  String get epTitle;

  /// No description provided for @epSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get epSave;

  /// No description provided for @epSaveChanges.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get epSaveChanges;

  /// No description provided for @epSaved.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get epSaved;

  /// No description provided for @epPublicSection.
  ///
  /// In en, this message translates to:
  /// **'Public profile'**
  String get epPublicSection;

  /// No description provided for @epPublicHint.
  ///
  /// In en, this message translates to:
  /// **'Anyone on BLOCKS can see this.'**
  String get epPublicHint;

  /// No description provided for @epPrivateSection.
  ///
  /// In en, this message translates to:
  /// **'Private details'**
  String get epPrivateSection;

  /// No description provided for @epPrivateHint.
  ///
  /// In en, this message translates to:
  /// **'Only you can see this.'**
  String get epPrivateHint;

  /// No description provided for @epName.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get epName;

  /// No description provided for @epUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get epUsername;

  /// No description provided for @epBio.
  ///
  /// In en, this message translates to:
  /// **'Bio'**
  String get epBio;

  /// No description provided for @epBioCount.
  ///
  /// In en, this message translates to:
  /// **'{n}/{total}'**
  String epBioCount(int n, int total);

  /// No description provided for @epWebsite.
  ///
  /// In en, this message translates to:
  /// **'Website'**
  String get epWebsite;

  /// No description provided for @epLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get epLocation;

  /// No description provided for @epCountry.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get epCountry;

  /// No description provided for @epState.
  ///
  /// In en, this message translates to:
  /// **'State'**
  String get epState;

  /// No description provided for @epDistrict.
  ///
  /// In en, this message translates to:
  /// **'District'**
  String get epDistrict;

  /// No description provided for @epDob.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get epDob;

  /// No description provided for @epDobHint.
  ///
  /// In en, this message translates to:
  /// **'Select your date of birth'**
  String get epDobHint;

  /// No description provided for @epGender.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get epGender;

  /// No description provided for @epGenderFemale.
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get epGenderFemale;

  /// No description provided for @epGenderMale.
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get epGenderMale;

  /// No description provided for @epGenderNonBinary.
  ///
  /// In en, this message translates to:
  /// **'Non-binary'**
  String get epGenderNonBinary;

  /// No description provided for @epGenderPrefer.
  ///
  /// In en, this message translates to:
  /// **'Prefer not to say'**
  String get epGenderPrefer;

  /// No description provided for @epLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get epLanguage;

  /// No description provided for @epLanguageHint.
  ///
  /// In en, this message translates to:
  /// **'Applies to the whole app straight away.'**
  String get epLanguageHint;

  /// No description provided for @epUsernameChecking.
  ///
  /// In en, this message translates to:
  /// **'Checking availability...'**
  String get epUsernameChecking;

  /// No description provided for @epUsernameAvailable.
  ///
  /// In en, this message translates to:
  /// **'This username is available'**
  String get epUsernameAvailable;

  /// No description provided for @epErrNameShort.
  ///
  /// In en, this message translates to:
  /// **'Enter at least {n} characters.'**
  String epErrNameShort(int n);

  /// No description provided for @epErrNameLong.
  ///
  /// In en, this message translates to:
  /// **'Use {n} characters or fewer.'**
  String epErrNameLong(int n);

  /// No description provided for @epErrUsernameShort.
  ///
  /// In en, this message translates to:
  /// **'Use at least {n} characters.'**
  String epErrUsernameShort(int n);

  /// No description provided for @epErrUsernameLong.
  ///
  /// In en, this message translates to:
  /// **'Use {n} characters or fewer.'**
  String epErrUsernameLong(int n);

  /// No description provided for @epErrUsernameChars.
  ///
  /// In en, this message translates to:
  /// **'Use only letters, numbers, dots and underscores. It can\'t start or end with a dot.'**
  String get epErrUsernameChars;

  /// No description provided for @epErrUsernameReserved.
  ///
  /// In en, this message translates to:
  /// **'That username isn\'t available.'**
  String get epErrUsernameReserved;

  /// No description provided for @epErrUsernameTaken.
  ///
  /// In en, this message translates to:
  /// **'That username is already taken.'**
  String get epErrUsernameTaken;

  /// No description provided for @epErrBioLong.
  ///
  /// In en, this message translates to:
  /// **'Keep your bio under {n} characters.'**
  String epErrBioLong(int n);

  /// No description provided for @epErrWebsite.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid website, for example example.com.'**
  String get epErrWebsite;

  /// No description provided for @epErrDobFuture.
  ///
  /// In en, this message translates to:
  /// **'Your date of birth can\'t be in the future.'**
  String get epErrDobFuture;

  /// No description provided for @epErrDobAge.
  ///
  /// In en, this message translates to:
  /// **'You must be at least {n} years old.'**
  String epErrDobAge(int n);

  /// No description provided for @epErrDobInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid date of birth.'**
  String get epErrDobInvalid;

  /// No description provided for @epDiscard.
  ///
  /// In en, this message translates to:
  /// **'Discard changes?'**
  String get epDiscard;

  /// No description provided for @epDiscardBody.
  ///
  /// In en, this message translates to:
  /// **'Your edits will be lost.'**
  String get epDiscardBody;

  /// No description provided for @epDiscardConfirm.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get epDiscardConfirm;

  /// No description provided for @epKeepEditing.
  ///
  /// In en, this message translates to:
  /// **'Keep editing'**
  String get epKeepEditing;

  /// No description provided for @phTitle.
  ///
  /// In en, this message translates to:
  /// **'Change Profile Photo'**
  String get phTitle;

  /// No description provided for @phTake.
  ///
  /// In en, this message translates to:
  /// **'Take Photo'**
  String get phTake;

  /// No description provided for @phChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose from Gallery'**
  String get phChoose;

  /// No description provided for @phRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove Photo'**
  String get phRemove;

  /// No description provided for @phRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove your photo?'**
  String get phRemoveTitle;

  /// No description provided for @phRemoveBody.
  ///
  /// In en, this message translates to:
  /// **'Your profile will show your initials instead.'**
  String get phRemoveBody;

  /// No description provided for @phEditSemantics.
  ///
  /// In en, this message translates to:
  /// **'Change profile photo'**
  String get phEditSemantics;

  /// No description provided for @phUploading.
  ///
  /// In en, this message translates to:
  /// **'Uploading photo... {percent}%'**
  String phUploading(int percent);

  /// No description provided for @phDone.
  ///
  /// In en, this message translates to:
  /// **'Profile photo updated'**
  String get phDone;

  /// No description provided for @phRemoved.
  ///
  /// In en, this message translates to:
  /// **'Profile photo removed'**
  String get phRemoved;

  /// No description provided for @phErrUnsupported.
  ///
  /// In en, this message translates to:
  /// **'Use a JPG, PNG or WebP photo.'**
  String get phErrUnsupported;

  /// No description provided for @phErrTooLarge.
  ///
  /// In en, this message translates to:
  /// **'That photo is too large. Choose one under {n} MB.'**
  String phErrTooLarge(int n);

  /// No description provided for @phErrNetwork.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t upload the photo. Check your connection and try again.'**
  String get phErrNetwork;

  /// No description provided for @phErrPick.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t open your camera or gallery.'**
  String get phErrPick;

  /// No description provided for @settingsEmail.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get settingsEmail;

  /// No description provided for @settingsPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get settingsPhone;

  /// No description provided for @settingsPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get settingsPassword;

  /// No description provided for @settingsSectionPrivacySafety.
  ///
  /// In en, this message translates to:
  /// **'Privacy & safety'**
  String get settingsSectionPrivacySafety;

  /// No description provided for @secOverview.
  ///
  /// In en, this message translates to:
  /// **'Security overview'**
  String get secOverview;

  /// No description provided for @reelVideoSemantics.
  ///
  /// In en, this message translates to:
  /// **'Reel by {name}. Tap to play or pause, double tap to like.'**
  String reelVideoSemantics(String name);

  /// No description provided for @audiencePrivate.
  ///
  /// In en, this message translates to:
  /// **'Private'**
  String get audiencePrivate;

  /// No description provided for @evPayoutAccountChanged.
  ///
  /// In en, this message translates to:
  /// **'Payout account changed'**
  String get evPayoutAccountChanged;

  /// No description provided for @evIdentityChanged.
  ///
  /// In en, this message translates to:
  /// **'Identity details submitted'**
  String get evIdentityChanged;

  /// No description provided for @rsToolClips.
  ///
  /// In en, this message translates to:
  /// **'Clips'**
  String get rsToolClips;

  /// No description provided for @rsToolTrim.
  ///
  /// In en, this message translates to:
  /// **'Trim'**
  String get rsToolTrim;

  /// No description provided for @rsToolMusic.
  ///
  /// In en, this message translates to:
  /// **'Music'**
  String get rsToolMusic;

  /// No description provided for @rsToolText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get rsToolText;

  /// No description provided for @rsToolStickers.
  ///
  /// In en, this message translates to:
  /// **'Stickers'**
  String get rsToolStickers;

  /// No description provided for @rsToolFilters.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get rsToolFilters;

  /// No description provided for @rsToolAdjust.
  ///
  /// In en, this message translates to:
  /// **'Adjust'**
  String get rsToolAdjust;

  /// No description provided for @rsToolTransitions.
  ///
  /// In en, this message translates to:
  /// **'Transitions'**
  String get rsToolTransitions;

  /// No description provided for @rsToolCover.
  ///
  /// In en, this message translates to:
  /// **'Cover'**
  String get rsToolCover;

  /// No description provided for @fltOriginal.
  ///
  /// In en, this message translates to:
  /// **'Original'**
  String get fltOriginal;

  /// No description provided for @fltVivid.
  ///
  /// In en, this message translates to:
  /// **'Vivid'**
  String get fltVivid;

  /// No description provided for @fltWarm.
  ///
  /// In en, this message translates to:
  /// **'Warm'**
  String get fltWarm;

  /// No description provided for @fltCool.
  ///
  /// In en, this message translates to:
  /// **'Cool'**
  String get fltCool;

  /// No description provided for @fltCinematic.
  ///
  /// In en, this message translates to:
  /// **'Cinematic'**
  String get fltCinematic;

  /// No description provided for @fltPortrait.
  ///
  /// In en, this message translates to:
  /// **'Portrait'**
  String get fltPortrait;

  /// No description provided for @fltVintage.
  ///
  /// In en, this message translates to:
  /// **'Vintage'**
  String get fltVintage;

  /// No description provided for @fltBw.
  ///
  /// In en, this message translates to:
  /// **'Black & White'**
  String get fltBw;

  /// No description provided for @fltGolden.
  ///
  /// In en, this message translates to:
  /// **'Golden Hour'**
  String get fltGolden;

  /// No description provided for @fltIndia.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get fltIndia;

  /// No description provided for @fltUrban.
  ///
  /// In en, this message translates to:
  /// **'Urban'**
  String get fltUrban;

  /// No description provided for @fltFood.
  ///
  /// In en, this message translates to:
  /// **'Foodie'**
  String get fltFood;

  /// No description provided for @fltTravel.
  ///
  /// In en, this message translates to:
  /// **'Travel'**
  String get fltTravel;

  /// No description provided for @fltNight.
  ///
  /// In en, this message translates to:
  /// **'Night'**
  String get fltNight;

  /// No description provided for @trNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get trNone;

  /// No description provided for @trFade.
  ///
  /// In en, this message translates to:
  /// **'Fade'**
  String get trFade;

  /// No description provided for @trSlide.
  ///
  /// In en, this message translates to:
  /// **'Slide'**
  String get trSlide;

  /// No description provided for @trZoom.
  ///
  /// In en, this message translates to:
  /// **'Zoom'**
  String get trZoom;

  /// No description provided for @trWipe.
  ///
  /// In en, this message translates to:
  /// **'Wipe'**
  String get trWipe;

  /// No description provided for @stkEmoji.
  ///
  /// In en, this message translates to:
  /// **'Emoji'**
  String get stkEmoji;

  /// No description provided for @stkIndia.
  ///
  /// In en, this message translates to:
  /// **'India'**
  String get stkIndia;

  /// No description provided for @stkTravel.
  ///
  /// In en, this message translates to:
  /// **'Travel'**
  String get stkTravel;

  /// No description provided for @stkFood.
  ///
  /// In en, this message translates to:
  /// **'Food'**
  String get stkFood;

  /// No description provided for @stkBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business'**
  String get stkBusiness;

  /// No description provided for @stkLove.
  ///
  /// In en, this message translates to:
  /// **'Love'**
  String get stkLove;

  /// No description provided for @stkFunny.
  ///
  /// In en, this message translates to:
  /// **'Funny'**
  String get stkFunny;

  /// No description provided for @stkFestival.
  ///
  /// In en, this message translates to:
  /// **'Festival'**
  String get stkFestival;

  /// No description provided for @stkSports.
  ///
  /// In en, this message translates to:
  /// **'Sports'**
  String get stkSports;

  /// No description provided for @stkCelebration.
  ///
  /// In en, this message translates to:
  /// **'Celebration'**
  String get stkCelebration;

  /// No description provided for @fontClean.
  ///
  /// In en, this message translates to:
  /// **'Clean'**
  String get fontClean;

  /// No description provided for @fontSerif.
  ///
  /// In en, this message translates to:
  /// **'Serif'**
  String get fontSerif;

  /// No description provided for @fontMono.
  ///
  /// In en, this message translates to:
  /// **'Mono'**
  String get fontMono;

  /// No description provided for @fontDisplay.
  ///
  /// In en, this message translates to:
  /// **'Display'**
  String get fontDisplay;

  /// No description provided for @fontScript.
  ///
  /// In en, this message translates to:
  /// **'Script'**
  String get fontScript;

  /// No description provided for @anNone.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get anNone;

  /// No description provided for @anFade.
  ///
  /// In en, this message translates to:
  /// **'Fade'**
  String get anFade;

  /// No description provided for @anPop.
  ///
  /// In en, this message translates to:
  /// **'Pop'**
  String get anPop;

  /// No description provided for @anSlideUp.
  ///
  /// In en, this message translates to:
  /// **'Slide up'**
  String get anSlideUp;

  /// No description provided for @anTypewriter.
  ///
  /// In en, this message translates to:
  /// **'Typewriter'**
  String get anTypewriter;

  /// No description provided for @adjBrightness.
  ///
  /// In en, this message translates to:
  /// **'Brightness'**
  String get adjBrightness;

  /// No description provided for @adjContrast.
  ///
  /// In en, this message translates to:
  /// **'Contrast'**
  String get adjContrast;

  /// No description provided for @adjSaturation.
  ///
  /// In en, this message translates to:
  /// **'Saturation'**
  String get adjSaturation;

  /// No description provided for @adjWarmth.
  ///
  /// In en, this message translates to:
  /// **'Warmth'**
  String get adjWarmth;

  /// No description provided for @adjHighlights.
  ///
  /// In en, this message translates to:
  /// **'Highlights'**
  String get adjHighlights;

  /// No description provided for @adjShadows.
  ///
  /// In en, this message translates to:
  /// **'Shadows'**
  String get adjShadows;

  /// No description provided for @adjSharpness.
  ///
  /// In en, this message translates to:
  /// **'Sharpness'**
  String get adjSharpness;

  /// No description provided for @adjFade.
  ///
  /// In en, this message translates to:
  /// **'Fade'**
  String get adjFade;

  /// No description provided for @adjVignette.
  ///
  /// In en, this message translates to:
  /// **'Vignette'**
  String get adjVignette;

  /// No description provided for @musTrending.
  ///
  /// In en, this message translates to:
  /// **'Trending'**
  String get musTrending;

  /// No description provided for @musPopular.
  ///
  /// In en, this message translates to:
  /// **'Popular'**
  String get musPopular;

  /// No description provided for @musNew.
  ///
  /// In en, this message translates to:
  /// **'New releases'**
  String get musNew;

  /// No description provided for @musHindi.
  ///
  /// In en, this message translates to:
  /// **'Hindi'**
  String get musHindi;

  /// No description provided for @musTelugu.
  ///
  /// In en, this message translates to:
  /// **'Telugu'**
  String get musTelugu;

  /// No description provided for @musTamil.
  ///
  /// In en, this message translates to:
  /// **'Tamil'**
  String get musTamil;

  /// No description provided for @musBengali.
  ///
  /// In en, this message translates to:
  /// **'Bengali'**
  String get musBengali;

  /// No description provided for @musMarathi.
  ///
  /// In en, this message translates to:
  /// **'Marathi'**
  String get musMarathi;

  /// No description provided for @musPunjabi.
  ///
  /// In en, this message translates to:
  /// **'Punjabi'**
  String get musPunjabi;

  /// No description provided for @musKannada.
  ///
  /// In en, this message translates to:
  /// **'Kannada'**
  String get musKannada;

  /// No description provided for @musMalayalam.
  ///
  /// In en, this message translates to:
  /// **'Malayalam'**
  String get musMalayalam;

  /// No description provided for @musInstrumental.
  ///
  /// In en, this message translates to:
  /// **'Instrumental'**
  String get musInstrumental;

  /// No description provided for @musDevotional.
  ///
  /// In en, this message translates to:
  /// **'Devotional'**
  String get musDevotional;

  /// No description provided for @musTravel.
  ///
  /// In en, this message translates to:
  /// **'Travel'**
  String get musTravel;

  /// No description provided for @musFitness.
  ///
  /// In en, this message translates to:
  /// **'Fitness'**
  String get musFitness;

  /// No description provided for @musRomantic.
  ///
  /// In en, this message translates to:
  /// **'Romantic'**
  String get musRomantic;

  /// No description provided for @musComedy.
  ///
  /// In en, this message translates to:
  /// **'Comedy'**
  String get musComedy;

  /// No description provided for @rightsPlatform.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS Library'**
  String get rightsPlatform;

  /// No description provided for @rightsLicensed.
  ///
  /// In en, this message translates to:
  /// **'Licensed'**
  String get rightsLicensed;

  /// No description provided for @rightsCreator.
  ///
  /// In en, this message translates to:
  /// **'Creator-owned'**
  String get rightsCreator;

  /// No description provided for @rightsFree.
  ///
  /// In en, this message translates to:
  /// **'Royalty-free'**
  String get rightsFree;

  /// No description provided for @rightsRestricted.
  ///
  /// In en, this message translates to:
  /// **'Restricted'**
  String get rightsRestricted;

  /// No description provided for @qualDataSaver.
  ///
  /// In en, this message translates to:
  /// **'Data Saver'**
  String get qualDataSaver;

  /// No description provided for @qualBalanced.
  ///
  /// In en, this message translates to:
  /// **'Balanced'**
  String get qualBalanced;

  /// No description provided for @qualHigh.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get qualHigh;

  /// No description provided for @qualOriginal.
  ///
  /// In en, this message translates to:
  /// **'Original'**
  String get qualOriginal;

  /// No description provided for @qualDataSaverHint.
  ///
  /// In en, this message translates to:
  /// **'Smallest upload. Good for slow or costly data.'**
  String get qualDataSaverHint;

  /// No description provided for @qualBalancedHint.
  ///
  /// In en, this message translates to:
  /// **'Recommended. Sharp picture with a smaller file.'**
  String get qualBalancedHint;

  /// No description provided for @qualHighHint.
  ///
  /// In en, this message translates to:
  /// **'Sharper detail at a higher bitrate.'**
  String get qualHighHint;

  /// No description provided for @qualOriginalHint.
  ///
  /// In en, this message translates to:
  /// **'No compression. Largest and slowest to upload.'**
  String get qualOriginalHint;

  /// No description provided for @pubPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing'**
  String get pubPreparing;

  /// No description provided for @pubCompressing.
  ///
  /// In en, this message translates to:
  /// **'Compressing'**
  String get pubCompressing;

  /// No description provided for @pubProcessing.
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get pubProcessing;

  /// No description provided for @pubUploading.
  ///
  /// In en, this message translates to:
  /// **'Uploading'**
  String get pubUploading;

  /// No description provided for @pubServer.
  ///
  /// In en, this message translates to:
  /// **'Processing on server'**
  String get pubServer;

  /// No description provided for @pubModeration.
  ///
  /// In en, this message translates to:
  /// **'Moderation'**
  String get pubModeration;

  /// No description provided for @pubPublished.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get pubPublished;

  /// No description provided for @pubFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get pubFailed;

  /// No description provided for @pubTitle.
  ///
  /// In en, this message translates to:
  /// **'Publishing'**
  String get pubTitle;

  /// No description provided for @pubKeepOpen.
  ///
  /// In en, this message translates to:
  /// **'Please keep BLOCKS open until your reel is published.'**
  String get pubKeepOpen;

  /// No description provided for @pubFileOf.
  ///
  /// In en, this message translates to:
  /// **'File {current} of {total}'**
  String pubFileOf(int current, int total);

  /// No description provided for @pubBytesOf.
  ///
  /// In en, this message translates to:
  /// **'{sent} of {size} uploaded'**
  String pubBytesOf(String sent, String size);

  /// No description provided for @pubServerBody.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS is preparing your reel for every screen size.'**
  String get pubServerBody;

  /// No description provided for @pubModerationBody.
  ///
  /// In en, this message translates to:
  /// **'Checking safety, copyright and community rules.'**
  String get pubModerationBody;

  /// No description provided for @pubCheckSafety.
  ///
  /// In en, this message translates to:
  /// **'Safety check'**
  String get pubCheckSafety;

  /// No description provided for @pubCheckCopyright.
  ///
  /// In en, this message translates to:
  /// **'Copyright check'**
  String get pubCheckCopyright;

  /// No description provided for @pubCheckPolicy.
  ///
  /// In en, this message translates to:
  /// **'Policy check'**
  String get pubCheckPolicy;

  /// No description provided for @pubDone.
  ///
  /// In en, this message translates to:
  /// **'done'**
  String get pubDone;

  /// No description provided for @pubInProgress.
  ///
  /// In en, this message translates to:
  /// **'in progress'**
  String get pubInProgress;

  /// No description provided for @pubWaiting.
  ///
  /// In en, this message translates to:
  /// **'waiting'**
  String get pubWaiting;

  /// No description provided for @pubPublishedTitle.
  ///
  /// In en, this message translates to:
  /// **'Reel Published ✓'**
  String get pubPublishedTitle;

  /// No description provided for @pubPublishedBody.
  ///
  /// In en, this message translates to:
  /// **'Your reel is eligible for {district} discovery.'**
  String pubPublishedBody(String district);

  /// No description provided for @pubViewReels.
  ///
  /// In en, this message translates to:
  /// **'Go to Reels'**
  String get pubViewReels;

  /// No description provided for @pubOpenStudio.
  ///
  /// In en, this message translates to:
  /// **'Open Creator Studio'**
  String get pubOpenStudio;

  /// No description provided for @pubFailedTitle.
  ///
  /// In en, this message translates to:
  /// **'Upload failed'**
  String get pubFailedTitle;

  /// No description provided for @pubFailNetwork.
  ///
  /// In en, this message translates to:
  /// **'The connection dropped. Nothing is lost, and the upload will continue where it stopped.'**
  String get pubFailNetwork;

  /// No description provided for @pubFailModeration.
  ///
  /// In en, this message translates to:
  /// **'This reel can’t be published. Reason: {reason}.'**
  String pubFailModeration(String reason);

  /// No description provided for @pubFailCancelled.
  ///
  /// In en, this message translates to:
  /// **'Publishing was stopped.'**
  String get pubFailCancelled;

  /// No description provided for @pubFailLimits.
  ///
  /// In en, this message translates to:
  /// **'Your reel doesn’t meet the length or size limits. Edit it and try again.'**
  String get pubFailLimits;

  /// No description provided for @pubFailUnknown.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get pubFailUnknown;

  /// No description provided for @pubSavedAsDraft.
  ///
  /// In en, this message translates to:
  /// **'Your reel is saved as a draft.'**
  String get pubSavedAsDraft;

  /// No description provided for @pubRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get pubRetry;

  /// No description provided for @pubEditReel.
  ///
  /// In en, this message translates to:
  /// **'Edit reel'**
  String get pubEditReel;

  /// No description provided for @pubSaveDraft.
  ///
  /// In en, this message translates to:
  /// **'Save Draft'**
  String get pubSaveDraft;

  /// No description provided for @pubLeaveTitle.
  ///
  /// In en, this message translates to:
  /// **'Stop publishing?'**
  String get pubLeaveTitle;

  /// No description provided for @pubLeaveBody.
  ///
  /// In en, this message translates to:
  /// **'Your reel stays saved as a draft and you can publish it later.'**
  String get pubLeaveBody;

  /// No description provided for @pubLeaveStay.
  ///
  /// In en, this message translates to:
  /// **'Keep publishing'**
  String get pubLeaveStay;

  /// No description provided for @pubLeaveCancel.
  ///
  /// In en, this message translates to:
  /// **'Stop and save draft'**
  String get pubLeaveCancel;

  /// No description provided for @rsTitle.
  ///
  /// In en, this message translates to:
  /// **'New reel'**
  String get rsTitle;

  /// No description provided for @rsSaveDraft.
  ///
  /// In en, this message translates to:
  /// **'Save Draft'**
  String get rsSaveDraft;

  /// No description provided for @rsNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get rsNext;

  /// No description provided for @rsPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish reel'**
  String get rsPublish;

  /// No description provided for @rsPlay.
  ///
  /// In en, this message translates to:
  /// **'Play preview'**
  String get rsPlay;

  /// No description provided for @rsPause.
  ///
  /// In en, this message translates to:
  /// **'Pause preview'**
  String get rsPause;

  /// No description provided for @rsPreviewEmpty.
  ///
  /// In en, this message translates to:
  /// **'Add videos or photos to start your reel.'**
  String get rsPreviewEmpty;

  /// No description provided for @rsPreviewLabel.
  ///
  /// In en, this message translates to:
  /// **'Preview at {time} of {length}'**
  String rsPreviewLabel(String time, String length);

  /// No description provided for @rsSeekValue.
  ///
  /// In en, this message translates to:
  /// **'{time}'**
  String rsSeekValue(String time);

  /// No description provided for @rsTextLayer.
  ///
  /// In en, this message translates to:
  /// **'Text: {text}'**
  String rsTextLayer(String text);

  /// No description provided for @rsStickerLayer.
  ///
  /// In en, this message translates to:
  /// **'Sticker {sticker}'**
  String rsStickerLayer(String sticker);

  /// No description provided for @rsTimeline.
  ///
  /// In en, this message translates to:
  /// **'Timeline'**
  String get rsTimeline;

  /// No description provided for @rsTotalOfLimit.
  ///
  /// In en, this message translates to:
  /// **'{used} of {limit}'**
  String rsTotalOfLimit(String used, String limit);

  /// No description provided for @rsTimelineEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your clips will appear here.'**
  String get rsTimelineEmpty;

  /// No description provided for @rsAddMedia.
  ///
  /// In en, this message translates to:
  /// **'Add media'**
  String get rsAddMedia;

  /// No description provided for @rsPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get rsPhoto;

  /// No description provided for @rsVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get rsVideo;

  /// No description provided for @rsClipLabel.
  ///
  /// In en, this message translates to:
  /// **'Clip {index} of {count}, {type}, {length}'**
  String rsClipLabel(int index, int count, String type, String length);

  /// No description provided for @rsMoveEarlier.
  ///
  /// In en, this message translates to:
  /// **'Move earlier'**
  String get rsMoveEarlier;

  /// No description provided for @rsMoveLater.
  ///
  /// In en, this message translates to:
  /// **'Move later'**
  String get rsMoveLater;

  /// No description provided for @rsClipsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Add videos and photos to start editing.'**
  String get rsClipsEmpty;

  /// No description provided for @rsSelectClip.
  ///
  /// In en, this message translates to:
  /// **'Select a clip in the timeline to edit it.'**
  String get rsSelectClip;

  /// No description provided for @rsReplace.
  ///
  /// In en, this message translates to:
  /// **'Replace'**
  String get rsReplace;

  /// No description provided for @rsDuplicate.
  ///
  /// In en, this message translates to:
  /// **'Duplicate'**
  String get rsDuplicate;

  /// No description provided for @rsSplit.
  ///
  /// In en, this message translates to:
  /// **'Split here'**
  String get rsSplit;

  /// No description provided for @rsDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get rsDelete;

  /// No description provided for @rsVolume.
  ///
  /// In en, this message translates to:
  /// **'Volume'**
  String get rsVolume;

  /// No description provided for @rsPhotoDuration.
  ///
  /// In en, this message translates to:
  /// **'How long to show this photo'**
  String get rsPhotoDuration;

  /// No description provided for @rsSecondsShort.
  ///
  /// In en, this message translates to:
  /// **'{seconds}s'**
  String rsSecondsShort(int seconds);

  /// No description provided for @rsMinutesShort.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min'**
  String rsMinutesShort(int minutes);

  /// No description provided for @rsTrimPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photos don’t need trimming. Choose how long this one stays on screen.'**
  String get rsTrimPhoto;

  /// No description provided for @rsTrimUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This clip can’t be trimmed.'**
  String get rsTrimUnavailable;

  /// No description provided for @rsTrimRange.
  ///
  /// In en, this message translates to:
  /// **'Trim start and end'**
  String get rsTrimRange;

  /// No description provided for @rsTrimStart.
  ///
  /// In en, this message translates to:
  /// **'Start {time}'**
  String rsTrimStart(String time);

  /// No description provided for @rsTrimEnd.
  ///
  /// In en, this message translates to:
  /// **'End {time}'**
  String rsTrimEnd(String time);

  /// No description provided for @rsTrimLength.
  ///
  /// In en, this message translates to:
  /// **'Length {length}'**
  String rsTrimLength(String length);

  /// No description provided for @rsResetTrim.
  ///
  /// In en, this message translates to:
  /// **'Reset trim'**
  String get rsResetTrim;

  /// No description provided for @rsTransitionBody.
  ///
  /// In en, this message translates to:
  /// **'How this clip changes into the next one.'**
  String get rsTransitionBody;

  /// No description provided for @rsTransitionLast.
  ///
  /// In en, this message translates to:
  /// **'The last clip has no next clip, so it has no transition.'**
  String get rsTransitionLast;

  /// No description provided for @rsApplyToAll.
  ///
  /// In en, this message translates to:
  /// **'Apply to all clips'**
  String get rsApplyToAll;

  /// No description provided for @rsIntensity.
  ///
  /// In en, this message translates to:
  /// **'Intensity'**
  String get rsIntensity;

  /// No description provided for @rsResetAdjust.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get rsResetAdjust;

  /// No description provided for @rsOriginalAudio.
  ///
  /// In en, this message translates to:
  /// **'Original audio'**
  String get rsOriginalAudio;

  /// No description provided for @rsOriginalAudioBody.
  ///
  /// In en, this message translates to:
  /// **'The sound from your own clips.'**
  String get rsOriginalAudioBody;

  /// No description provided for @rsMusicSelected.
  ///
  /// In en, this message translates to:
  /// **'{title} by {artist}'**
  String rsMusicSelected(String title, String artist);

  /// No description provided for @rsMusicClipRange.
  ///
  /// In en, this message translates to:
  /// **'{artist} · {start}–{end}'**
  String rsMusicClipRange(String artist, String start, String end);

  /// No description provided for @rsAddMusic.
  ///
  /// In en, this message translates to:
  /// **'Add music'**
  String get rsAddMusic;

  /// No description provided for @rsChangeMusic.
  ///
  /// In en, this message translates to:
  /// **'Change music'**
  String get rsChangeMusic;

  /// No description provided for @rsEditMusicClip.
  ///
  /// In en, this message translates to:
  /// **'Choose part'**
  String get rsEditMusicClip;

  /// No description provided for @rsRemoveMusic.
  ///
  /// In en, this message translates to:
  /// **'Remove music'**
  String get rsRemoveMusic;

  /// No description provided for @rsOriginalSound.
  ///
  /// In en, this message translates to:
  /// **'Original sound'**
  String get rsOriginalSound;

  /// No description provided for @rsCoverPreview.
  ///
  /// In en, this message translates to:
  /// **'Cover preview'**
  String get rsCoverPreview;

  /// No description provided for @rsCoverFirst.
  ///
  /// In en, this message translates to:
  /// **'First frame'**
  String get rsCoverFirst;

  /// No description provided for @rsCoverFrame.
  ///
  /// In en, this message translates to:
  /// **'Pick a frame'**
  String get rsCoverFrame;

  /// No description provided for @rsCoverImage.
  ///
  /// In en, this message translates to:
  /// **'From photos'**
  String get rsCoverImage;

  /// No description provided for @rsCoverAt.
  ///
  /// In en, this message translates to:
  /// **'Frame at'**
  String get rsCoverAt;

  /// No description provided for @rsCoverPhotos.
  ///
  /// In en, this message translates to:
  /// **'Choose a photo'**
  String get rsCoverPhotos;

  /// No description provided for @rsCoverPhotoN.
  ///
  /// In en, this message translates to:
  /// **'Photo {index}'**
  String rsCoverPhotoN(int index);

  /// No description provided for @rsCoverText.
  ///
  /// In en, this message translates to:
  /// **'Cover text'**
  String get rsCoverText;

  /// No description provided for @rsCoverTextHint.
  ///
  /// In en, this message translates to:
  /// **'A short title for your cover'**
  String get rsCoverTextHint;

  /// No description provided for @rsLayers.
  ///
  /// In en, this message translates to:
  /// **'Layers'**
  String get rsLayers;

  /// No description provided for @rsTextNew.
  ///
  /// In en, this message translates to:
  /// **'New text'**
  String get rsTextNew;

  /// No description provided for @rsTextHint.
  ///
  /// In en, this message translates to:
  /// **'Type something…'**
  String get rsTextHint;

  /// No description provided for @rsTextAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get rsTextAdd;

  /// No description provided for @rsTextEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit text'**
  String get rsTextEdit;

  /// No description provided for @rsFont.
  ///
  /// In en, this message translates to:
  /// **'Font'**
  String get rsFont;

  /// No description provided for @rsColor.
  ///
  /// In en, this message translates to:
  /// **'Colour'**
  String get rsColor;

  /// No description provided for @rsColorSwatch.
  ///
  /// In en, this message translates to:
  /// **'Colour {color}'**
  String rsColorSwatch(String color);

  /// No description provided for @rsAlignment.
  ///
  /// In en, this message translates to:
  /// **'Alignment'**
  String get rsAlignment;

  /// No description provided for @rsAlignStart.
  ///
  /// In en, this message translates to:
  /// **'Left'**
  String get rsAlignStart;

  /// No description provided for @rsAlignCenter.
  ///
  /// In en, this message translates to:
  /// **'Centre'**
  String get rsAlignCenter;

  /// No description provided for @rsAlignEnd.
  ///
  /// In en, this message translates to:
  /// **'Right'**
  String get rsAlignEnd;

  /// No description provided for @rsBackground.
  ///
  /// In en, this message translates to:
  /// **'Background'**
  String get rsBackground;

  /// No description provided for @rsNoBackground.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get rsNoBackground;

  /// No description provided for @rsBackgroundSwatch.
  ///
  /// In en, this message translates to:
  /// **'Background colour {color}'**
  String rsBackgroundSwatch(String color);

  /// No description provided for @rsOpacity.
  ///
  /// In en, this message translates to:
  /// **'Opacity'**
  String get rsOpacity;

  /// No description provided for @rsAnimation.
  ///
  /// In en, this message translates to:
  /// **'Animation'**
  String get rsAnimation;

  /// No description provided for @rsSize.
  ///
  /// In en, this message translates to:
  /// **'Size'**
  String get rsSize;

  /// No description provided for @rsRotation.
  ///
  /// In en, this message translates to:
  /// **'Rotation'**
  String get rsRotation;

  /// No description provided for @rsVisibleBetween.
  ///
  /// In en, this message translates to:
  /// **'Shown on screen between'**
  String get rsVisibleBetween;

  /// No description provided for @rsVisibleFor.
  ///
  /// In en, this message translates to:
  /// **'Visible for {length}, from {start}'**
  String rsVisibleFor(String length, String start);

  /// No description provided for @rsAddSticker.
  ///
  /// In en, this message translates to:
  /// **'Add sticker {sticker}'**
  String rsAddSticker(String sticker);

  /// No description provided for @rsStickerHint.
  ///
  /// In en, this message translates to:
  /// **'Tap a sticker to add it. Drag it on the preview to move it; use two fingers to resize and rotate.'**
  String get rsStickerHint;

  /// No description provided for @rsLengthLimit.
  ///
  /// In en, this message translates to:
  /// **'Reel length'**
  String get rsLengthLimit;

  /// No description provided for @rsIssueNoClips.
  ///
  /// In en, this message translates to:
  /// **'Add at least one video or photo.'**
  String get rsIssueNoClips;

  /// No description provided for @rsIssueTooLong.
  ///
  /// In en, this message translates to:
  /// **'Your reel is longer than {seconds} seconds. Trim a clip or choose a longer reel length.'**
  String rsIssueTooLong(int seconds);

  /// No description provided for @rsIssueTooManyClips.
  ///
  /// In en, this message translates to:
  /// **'You can use up to {count} clips in one reel.'**
  String rsIssueTooManyClips(int count);

  /// No description provided for @rsIssueTooManyPhotos.
  ///
  /// In en, this message translates to:
  /// **'You can use up to {count} photos in one reel.'**
  String rsIssueTooManyPhotos(int count);

  /// No description provided for @rsIssueVideoTooLarge.
  ///
  /// In en, this message translates to:
  /// **'Videos can be up to {mb} MB.'**
  String rsIssueVideoTooLarge(int mb);

  /// No description provided for @rsIssueClipTooShort.
  ///
  /// In en, this message translates to:
  /// **'One of your clips is too short.'**
  String get rsIssueClipTooShort;

  /// No description provided for @rsSliverCut.
  ///
  /// In en, this message translates to:
  /// **'A cut there would leave a clip that is too short.'**
  String get rsSliverCut;

  /// No description provided for @rsDraftSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved to Drafts'**
  String get rsDraftSaved;

  /// No description provided for @rsDraftSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn’t save the draft. Try again.'**
  String get rsDraftSaveFailed;

  /// No description provided for @rsMusicUnavailable.
  ///
  /// In en, this message translates to:
  /// **'That track is no longer available.'**
  String get rsMusicUnavailable;

  /// No description provided for @rsLeaveTitle.
  ///
  /// In en, this message translates to:
  /// **'Leave the editor?'**
  String get rsLeaveTitle;

  /// No description provided for @rsLeaveBody.
  ///
  /// In en, this message translates to:
  /// **'You have unsaved changes.'**
  String get rsLeaveBody;

  /// No description provided for @rsLeaveStay.
  ///
  /// In en, this message translates to:
  /// **'Keep editing'**
  String get rsLeaveStay;

  /// No description provided for @rsLeaveDiscard.
  ///
  /// In en, this message translates to:
  /// **'Discard'**
  String get rsLeaveDiscard;

  /// No description provided for @rsLeaveSave.
  ///
  /// In en, this message translates to:
  /// **'Save draft'**
  String get rsLeaveSave;

  /// No description provided for @rsPickerTitle.
  ///
  /// In en, this message translates to:
  /// **'Add to your reel'**
  String get rsPickerTitle;

  /// No description provided for @rsPickerBody.
  ///
  /// In en, this message translates to:
  /// **'Tap videos and photos in the order you want them. You can reorder them later.'**
  String get rsPickerBody;

  /// No description provided for @rsReplaceTitle.
  ///
  /// In en, this message translates to:
  /// **'Replace clip'**
  String get rsReplaceTitle;

  /// No description provided for @rsReplaceBody.
  ///
  /// In en, this message translates to:
  /// **'Pick the video or photo to use instead.'**
  String get rsReplaceBody;

  /// No description provided for @rsFilterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get rsFilterAll;

  /// No description provided for @rsFilterVideos.
  ///
  /// In en, this message translates to:
  /// **'Videos'**
  String get rsFilterVideos;

  /// No description provided for @rsFilterPhotos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get rsFilterPhotos;

  /// No description provided for @rsRecord.
  ///
  /// In en, this message translates to:
  /// **'Record a video'**
  String get rsRecord;

  /// No description provided for @rsRecordFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn’t record. Try again.'**
  String get rsRecordFailed;

  /// No description provided for @rsPickerEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get rsPickerEmpty;

  /// No description provided for @rsPickerEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Record a video or add photos to your gallery.'**
  String get rsPickerEmptyBody;

  /// No description provided for @rsPickerAdd.
  ///
  /// In en, this message translates to:
  /// **'Add {count} to reel'**
  String rsPickerAdd(int count);

  /// No description provided for @rsPickerAddNone.
  ///
  /// In en, this message translates to:
  /// **'Select videos or photos'**
  String get rsPickerAddNone;

  /// No description provided for @rsSelectedSummary.
  ///
  /// In en, this message translates to:
  /// **'{videos} videos, {photos} photos'**
  String rsSelectedSummary(int videos, int photos);

  /// No description provided for @rsSelectedN.
  ///
  /// In en, this message translates to:
  /// **'selected, number {n}'**
  String rsSelectedN(int n);

  /// No description provided for @rsTooLarge.
  ///
  /// In en, this message translates to:
  /// **'Too large'**
  String get rsTooLarge;

  /// No description provided for @rsGalleryItemTooLarge.
  ///
  /// In en, this message translates to:
  /// **'{type}, {size}. Too large to add.'**
  String rsGalleryItemTooLarge(String type, String size);

  /// No description provided for @rsMusicTitle.
  ///
  /// In en, this message translates to:
  /// **'Add music'**
  String get rsMusicTitle;

  /// No description provided for @rsMusicSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search title, artist, language or genre'**
  String get rsMusicSearchHint;

  /// No description provided for @rsClearSearch.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get rsClearSearch;

  /// No description provided for @rsAllMusic.
  ///
  /// In en, this message translates to:
  /// **'All music'**
  String get rsAllMusic;

  /// No description provided for @rsTrendingNow.
  ///
  /// In en, this message translates to:
  /// **'Trending now'**
  String get rsTrendingNow;

  /// No description provided for @rsMusicRightsNote.
  ///
  /// In en, this message translates to:
  /// **'Every track here is licensed, owned by BLOCKS, or made by creators who allow its use.'**
  String get rsMusicRightsNote;

  /// No description provided for @rsMusicEmpty.
  ///
  /// In en, this message translates to:
  /// **'No music found'**
  String get rsMusicEmpty;

  /// No description provided for @rsMusicEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Try another word or category.'**
  String get rsMusicEmptyBody;

  /// No description provided for @rsReelsUsing.
  ///
  /// In en, this message translates to:
  /// **'{reels} reels'**
  String rsReelsUsing(String reels);

  /// No description provided for @rsTrackLabel.
  ///
  /// In en, this message translates to:
  /// **'{title}. {meta}'**
  String rsTrackLabel(String title, String meta);

  /// No description provided for @rsPreviewOf.
  ///
  /// In en, this message translates to:
  /// **'Preview {title}'**
  String rsPreviewOf(String title);

  /// No description provided for @rsStopPreviewOf.
  ///
  /// In en, this message translates to:
  /// **'Stop preview of {title}'**
  String rsStopPreviewOf(String title);

  /// No description provided for @rsClipTitle.
  ///
  /// In en, this message translates to:
  /// **'Choose the part to use'**
  String get rsClipTitle;

  /// No description provided for @rsClipRange.
  ///
  /// In en, this message translates to:
  /// **'Music start and end'**
  String get rsClipRange;

  /// No description provided for @rsClipNote.
  ///
  /// In en, this message translates to:
  /// **'The music can be up to {length} long, the length of your reel.'**
  String rsClipNote(String length);

  /// No description provided for @rsPreviewClip.
  ///
  /// In en, this message translates to:
  /// **'Preview'**
  String get rsPreviewClip;

  /// No description provided for @rsStopPreview.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get rsStopPreview;

  /// No description provided for @rsUseClip.
  ///
  /// In en, this message translates to:
  /// **'Use this part'**
  String get rsUseClip;

  /// No description provided for @rsDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Reel details'**
  String get rsDetailsTitle;

  /// No description provided for @rsHashtags.
  ///
  /// In en, this message translates to:
  /// **'Hashtags'**
  String get rsHashtags;

  /// No description provided for @rsTagPeople.
  ///
  /// In en, this message translates to:
  /// **'Tag people'**
  String get rsTagPeople;

  /// No description provided for @rsTagNobody.
  ///
  /// In en, this message translates to:
  /// **'Nobody tagged'**
  String get rsTagNobody;

  /// No description provided for @rsTaggedCount.
  ///
  /// In en, this message translates to:
  /// **'{count} people tagged'**
  String rsTaggedCount(int count);

  /// No description provided for @rsTagSearchHint.
  ///
  /// In en, this message translates to:
  /// **'Search people'**
  String get rsTagSearchHint;

  /// No description provided for @rsTagDone.
  ///
  /// In en, this message translates to:
  /// **'Done ({count})'**
  String rsTagDone(int count);

  /// No description provided for @rsAllowComments.
  ///
  /// In en, this message translates to:
  /// **'Allow comments'**
  String get rsAllowComments;

  /// No description provided for @rsAllowRemix.
  ///
  /// In en, this message translates to:
  /// **'Allow remix'**
  String get rsAllowRemix;

  /// No description provided for @rsAllowRemixBody.
  ///
  /// In en, this message translates to:
  /// **'Others can use your audio or build on your reel.'**
  String get rsAllowRemixBody;

  /// No description provided for @rsAllowSharing.
  ///
  /// In en, this message translates to:
  /// **'Allow sharing'**
  String get rsAllowSharing;

  /// No description provided for @rsQualityTitle.
  ///
  /// In en, this message translates to:
  /// **'Upload quality'**
  String get rsQualityTitle;

  /// No description provided for @rsQualityBody.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS makes your files smaller on your phone, so uploads are faster and use less data.'**
  String get rsQualityBody;

  /// No description provided for @rsSizeOriginal.
  ///
  /// In en, this message translates to:
  /// **'Original'**
  String get rsSizeOriginal;

  /// No description provided for @rsSizeOptimized.
  ///
  /// In en, this message translates to:
  /// **'Optimized'**
  String get rsSizeOptimized;

  /// No description provided for @rsSizeSaved.
  ///
  /// In en, this message translates to:
  /// **'Smaller'**
  String get rsSizeSaved;

  /// No description provided for @rsSizeSummary.
  ///
  /// In en, this message translates to:
  /// **'Original {original}, optimized {optimized}, {percent} percent smaller'**
  String rsSizeSummary(String original, String optimized, int percent);

  /// No description provided for @rsQualityNote.
  ///
  /// In en, this message translates to:
  /// **'Videos are sent at up to {resolution}.'**
  String rsQualityNote(String resolution);

  /// No description provided for @rsQualityNoteOriginal.
  ///
  /// In en, this message translates to:
  /// **'Your files are sent exactly as they are. This uses the most data.'**
  String get rsQualityNoteOriginal;

  /// No description provided for @rsServerNote.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS checks and re-encodes every upload on its own servers, so quality and safety never depend on your phone.'**
  String get rsServerNote;

  /// No description provided for @csNavLabel.
  ///
  /// In en, this message translates to:
  /// **'Creator Studio sections'**
  String get csNavLabel;

  /// No description provided for @csNavOverview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get csNavOverview;

  /// No description provided for @csNavReels.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get csNavReels;

  /// No description provided for @csNavPosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get csNavPosts;

  /// No description provided for @csNavDrafts.
  ///
  /// In en, this message translates to:
  /// **'Drafts'**
  String get csNavDrafts;

  /// No description provided for @csNavAnalytics.
  ///
  /// In en, this message translates to:
  /// **'Analytics'**
  String get csNavAnalytics;

  /// No description provided for @csNavReach.
  ///
  /// In en, this message translates to:
  /// **'Reach'**
  String get csNavReach;

  /// No description provided for @csNavEarnings.
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get csNavEarnings;

  /// No description provided for @csNavPayout.
  ///
  /// In en, this message translates to:
  /// **'Payout'**
  String get csNavPayout;

  /// No description provided for @csEstimatedChip.
  ///
  /// In en, this message translates to:
  /// **'Estimated'**
  String get csEstimatedChip;

  /// No description provided for @csThisMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get csThisMonth;

  /// No description provided for @csThisMonthAmount.
  ///
  /// In en, this message translates to:
  /// **'This month {amount}'**
  String csThisMonthAmount(String amount);

  /// No description provided for @csAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get csAvailable;

  /// No description provided for @csPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get csPending;

  /// No description provided for @csPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get csPaid;

  /// No description provided for @csMenuTitle.
  ///
  /// In en, this message translates to:
  /// **'Your studio'**
  String get csMenuTitle;

  /// No description provided for @csHintReels.
  ///
  /// In en, this message translates to:
  /// **'Your published reels'**
  String get csHintReels;

  /// No description provided for @csHintPosts.
  ///
  /// In en, this message translates to:
  /// **'Photo and text posts'**
  String get csHintPosts;

  /// No description provided for @csHintDrafts.
  ///
  /// In en, this message translates to:
  /// **'Unfinished reels'**
  String get csHintDrafts;

  /// No description provided for @csHintDraftsCount.
  ///
  /// In en, this message translates to:
  /// **'{count} unfinished'**
  String csHintDraftsCount(int count);

  /// No description provided for @csHintAnalytics.
  ///
  /// In en, this message translates to:
  /// **'Views, watch time, audience'**
  String get csHintAnalytics;

  /// No description provided for @csHintReach.
  ///
  /// In en, this message translates to:
  /// **'Climb the Reach Ladder'**
  String get csHintReach;

  /// No description provided for @csHintEarnings.
  ///
  /// In en, this message translates to:
  /// **'Estimated rewards'**
  String get csHintEarnings;

  /// No description provided for @csHintPayout.
  ///
  /// In en, this message translates to:
  /// **'Verify, add bank, withdraw'**
  String get csHintPayout;

  /// No description provided for @csPayoutSetupTitle.
  ///
  /// In en, this message translates to:
  /// **'Get paid'**
  String get csPayoutSetupTitle;

  /// No description provided for @csPayoutSetupBody.
  ///
  /// In en, this message translates to:
  /// **'Verify your identity, add a bank account, then withdraw once you have {minimum} available.'**
  String csPayoutSetupBody(String minimum);

  /// No description provided for @csPayoutReadyTitle.
  ///
  /// In en, this message translates to:
  /// **'Ready to withdraw'**
  String get csPayoutReadyTitle;

  /// No description provided for @csPayoutReadyBody.
  ///
  /// In en, this message translates to:
  /// **'{amount} is available to withdraw.'**
  String csPayoutReadyBody(String amount);

  /// No description provided for @csStepIdentity.
  ///
  /// In en, this message translates to:
  /// **'Verify identity'**
  String get csStepIdentity;

  /// No description provided for @csStepBank.
  ///
  /// In en, this message translates to:
  /// **'Add a bank account'**
  String get csStepBank;

  /// No description provided for @csStepWithdraw.
  ///
  /// In en, this message translates to:
  /// **'Withdraw your earnings'**
  String get csStepWithdraw;

  /// No description provided for @csStepDone.
  ///
  /// In en, this message translates to:
  /// **'done'**
  String get csStepDone;

  /// No description provided for @csSetUpPayouts.
  ///
  /// In en, this message translates to:
  /// **'Set up payouts'**
  String get csSetUpPayouts;

  /// No description provided for @csRequestPayout.
  ///
  /// In en, this message translates to:
  /// **'Request payout'**
  String get csRequestPayout;

  /// No description provided for @csNewReel.
  ///
  /// In en, this message translates to:
  /// **'New reel'**
  String get csNewReel;

  /// No description provided for @csNewPost.
  ///
  /// In en, this message translates to:
  /// **'New post'**
  String get csNewPost;

  /// No description provided for @csNew.
  ///
  /// In en, this message translates to:
  /// **'New'**
  String get csNew;

  /// No description provided for @csNoCaption.
  ///
  /// In en, this message translates to:
  /// **'No caption'**
  String get csNoCaption;

  /// No description provided for @csReelsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No reels yet'**
  String get csReelsEmpty;

  /// No description provided for @csReelsEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Make your first reel and it starts in your District.'**
  String get csReelsEmptyBody;

  /// No description provided for @csPostsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No posts yet'**
  String get csPostsEmpty;

  /// No description provided for @csPostsEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Share a photo or a thought with your District.'**
  String get csPostsEmptyBody;

  /// No description provided for @csReelRowLabel.
  ///
  /// In en, this message translates to:
  /// **'{title}, {views} views'**
  String csReelRowLabel(String title, String views);

  /// No description provided for @csViewsCount.
  ///
  /// In en, this message translates to:
  /// **'{views} views'**
  String csViewsCount(String views);

  /// No description provided for @csDraftsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No drafts'**
  String get csDraftsEmpty;

  /// No description provided for @csDraftsEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Reels you save while editing appear here.'**
  String get csDraftsEmptyBody;

  /// No description provided for @csDraftReady.
  ///
  /// In en, this message translates to:
  /// **'Ready to publish'**
  String get csDraftReady;

  /// No description provided for @csDraftNeedsChanges.
  ///
  /// In en, this message translates to:
  /// **'Needs changes'**
  String get csDraftNeedsChanges;

  /// No description provided for @csDraftClips.
  ///
  /// In en, this message translates to:
  /// **'{count} clips · {length}'**
  String csDraftClips(int count, String length);

  /// No description provided for @csDraftEdited.
  ///
  /// In en, this message translates to:
  /// **'Edited {ago}'**
  String csDraftEdited(String ago);

  /// No description provided for @csDraftLabel.
  ///
  /// In en, this message translates to:
  /// **'Draft with {count} clips, {length}, {status}'**
  String csDraftLabel(int count, String length, String status);

  /// No description provided for @csContinueEditing.
  ///
  /// In en, this message translates to:
  /// **'Continue editing'**
  String get csContinueEditing;

  /// No description provided for @csDraftDeleteTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete this draft?'**
  String get csDraftDeleteTitle;

  /// No description provided for @csDraftDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'It will be removed from this device. The videos and photos in your gallery are not touched.'**
  String get csDraftDeleteBody;

  /// No description provided for @csDraftDeleted.
  ///
  /// In en, this message translates to:
  /// **'Draft deleted'**
  String get csDraftDeleted;

  /// No description provided for @csDraftDuplicated.
  ///
  /// In en, this message translates to:
  /// **'Draft duplicated'**
  String get csDraftDuplicated;

  /// No description provided for @caRangeLabel.
  ///
  /// In en, this message translates to:
  /// **'Time range'**
  String get caRangeLabel;

  /// No description provided for @caRange7.
  ///
  /// In en, this message translates to:
  /// **'7 days'**
  String get caRange7;

  /// No description provided for @caRange28.
  ///
  /// In en, this message translates to:
  /// **'28 days'**
  String get caRange28;

  /// No description provided for @caRange90.
  ///
  /// In en, this message translates to:
  /// **'90 days'**
  String get caRange90;

  /// No description provided for @caViewsChartTitle.
  ///
  /// In en, this message translates to:
  /// **'Views per day'**
  String get caViewsChartTitle;

  /// No description provided for @caViewsChartSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{views} views in {days} days'**
  String caViewsChartSubtitle(String views, int days);

  /// No description provided for @caViewsChartLabel.
  ///
  /// In en, this message translates to:
  /// **'Views per day over the last {days} days, {views} in total'**
  String caViewsChartLabel(int days, String views);

  /// No description provided for @caViews.
  ///
  /// In en, this message translates to:
  /// **'Views'**
  String get caViews;

  /// No description provided for @caQualifiedViews.
  ///
  /// In en, this message translates to:
  /// **'Qualified views'**
  String get caQualifiedViews;

  /// No description provided for @caWatchTime.
  ///
  /// In en, this message translates to:
  /// **'Watch time'**
  String get caWatchTime;

  /// No description provided for @caEngagement.
  ///
  /// In en, this message translates to:
  /// **'Engagement'**
  String get caEngagement;

  /// No description provided for @caLikes.
  ///
  /// In en, this message translates to:
  /// **'Likes'**
  String get caLikes;

  /// No description provided for @caComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get caComments;

  /// No description provided for @caShares.
  ///
  /// In en, this message translates to:
  /// **'Shares'**
  String get caShares;

  /// No description provided for @caSaves.
  ///
  /// In en, this message translates to:
  /// **'Saves'**
  String get caSaves;

  /// No description provided for @caFollowers.
  ///
  /// In en, this message translates to:
  /// **'New followers'**
  String get caFollowers;

  /// No description provided for @caAudienceTitle.
  ///
  /// In en, this message translates to:
  /// **'Where your viewers are'**
  String get caAudienceTitle;

  /// No description provided for @caAudienceOther.
  ///
  /// In en, this message translates to:
  /// **'Other places'**
  String get caAudienceOther;

  /// No description provided for @caReelsTitle.
  ///
  /// In en, this message translates to:
  /// **'Your reels'**
  String get caReelsTitle;

  /// No description provided for @caReelsHint.
  ///
  /// In en, this message translates to:
  /// **'Tap a reel for its full numbers.'**
  String get caReelsHint;

  /// No description provided for @caCollecting.
  ///
  /// In en, this message translates to:
  /// **'Collecting data'**
  String get caCollecting;

  /// No description provided for @caCollectingBody.
  ///
  /// In en, this message translates to:
  /// **'Numbers for a new reel appear shortly after it is published.'**
  String get caCollectingBody;

  /// No description provided for @caCompletionShort.
  ///
  /// In en, this message translates to:
  /// **'{rate} watched to end'**
  String caCompletionShort(String rate);

  /// No description provided for @caHours.
  ///
  /// In en, this message translates to:
  /// **'{hours} h'**
  String caHours(int hours);

  /// No description provided for @caMinutes.
  ///
  /// In en, this message translates to:
  /// **'{minutes} min'**
  String caMinutes(int minutes);

  /// No description provided for @caReelTitle.
  ///
  /// In en, this message translates to:
  /// **'Reel analytics'**
  String get caReelTitle;

  /// No description provided for @caQualifiedReachIs.
  ///
  /// In en, this message translates to:
  /// **'{reach} qualified reach'**
  String caQualifiedReachIs(String reach);

  /// No description provided for @caReachTitle.
  ///
  /// In en, this message translates to:
  /// **'Reach Ladder'**
  String get caReachTitle;

  /// No description provided for @caReachBody.
  ///
  /// In en, this message translates to:
  /// **'How far this reel has climbed from District to Global.'**
  String get caReachBody;

  /// No description provided for @caAvgWatch.
  ///
  /// In en, this message translates to:
  /// **'Average watch'**
  String get caAvgWatch;

  /// No description provided for @caSecondsOf.
  ///
  /// In en, this message translates to:
  /// **'{current}s of {total}s'**
  String caSecondsOf(int current, int total);

  /// No description provided for @caCompletion.
  ///
  /// In en, this message translates to:
  /// **'Watched to the end'**
  String get caCompletion;

  /// No description provided for @caEstEarnings.
  ///
  /// In en, this message translates to:
  /// **'Estimated earnings'**
  String get caEstEarnings;

  /// No description provided for @caRetentionTitle.
  ///
  /// In en, this message translates to:
  /// **'Audience retention'**
  String get caRetentionTitle;

  /// No description provided for @caRetentionBody.
  ///
  /// In en, this message translates to:
  /// **'How many viewers were still watching, from the start to the end of the reel.'**
  String get caRetentionBody;

  /// No description provided for @caRetentionLabel.
  ///
  /// In en, this message translates to:
  /// **'Audience retention curve: {rate} watched to the end'**
  String caRetentionLabel(String rate);

  /// No description provided for @crYourLevel.
  ///
  /// In en, this message translates to:
  /// **'Your Reach level'**
  String get crYourLevel;

  /// No description provided for @crYourLevelBody.
  ///
  /// In en, this message translates to:
  /// **'{reach} qualified reach in the last 30 days'**
  String crYourLevelBody(String reach);

  /// No description provided for @crLevelsTitle.
  ///
  /// In en, this message translates to:
  /// **'The four levels'**
  String get crLevelsTitle;

  /// No description provided for @crLevelsBody.
  ///
  /// In en, this message translates to:
  /// **'Content starts in your District and climbs as more real people watch it.'**
  String get crLevelsBody;

  /// No description provided for @crRange.
  ///
  /// In en, this message translates to:
  /// **'{from} – {to} qualified reach'**
  String crRange(String from, String to);

  /// No description provided for @crRangeOpen.
  ///
  /// In en, this message translates to:
  /// **'{from}+ qualified reach'**
  String crRangeOpen(String from);

  /// No description provided for @crLevelReached.
  ///
  /// In en, this message translates to:
  /// **'Reached'**
  String get crLevelReached;

  /// No description provided for @crLevelLocked.
  ///
  /// In en, this message translates to:
  /// **'Not reached yet'**
  String get crLevelLocked;

  /// No description provided for @crReelsTitle.
  ///
  /// In en, this message translates to:
  /// **'Your reels on the ladder'**
  String get crReelsTitle;

  /// No description provided for @crReelsBody.
  ///
  /// In en, this message translates to:
  /// **'How far each reel is from its next level.'**
  String get crReelsBody;

  /// No description provided for @crReelProgress.
  ///
  /// In en, this message translates to:
  /// **'{title}: {level}. {remaining} more qualified reach to reach {next}.'**
  String crReelProgress(
    String title,
    String level,
    String remaining,
    String next,
  );

  /// No description provided for @crReelTop.
  ///
  /// In en, this message translates to:
  /// **'{title}: at the top of the ladder.'**
  String crReelTop(String title);

  /// No description provided for @crTopLevel.
  ///
  /// In en, this message translates to:
  /// **'At the top of the ladder'**
  String get crTopLevel;

  /// No description provided for @crToNext.
  ///
  /// In en, this message translates to:
  /// **'{remaining} more to reach {next}'**
  String crToNext(String remaining, String next);

  /// No description provided for @crQualifiedTitle.
  ///
  /// In en, this message translates to:
  /// **'What is qualified reach?'**
  String get crQualifiedTitle;

  /// No description provided for @crQualifiedBody.
  ///
  /// In en, this message translates to:
  /// **'Qualified reach counts real people who actually watched your content. Repeat views from the same person, bots and accidental taps do not count. The thresholds for each level are set by BLOCKS and can change.'**
  String get crQualifiedBody;

  /// No description provided for @ceAvailableHint.
  ///
  /// In en, this message translates to:
  /// **'Ready to withdraw'**
  String get ceAvailableHint;

  /// No description provided for @cePendingHint.
  ///
  /// In en, this message translates to:
  /// **'Still being checked'**
  String get cePendingHint;

  /// No description provided for @cePaidHint.
  ///
  /// In en, this message translates to:
  /// **'Sent to your bank'**
  String get cePaidHint;

  /// No description provided for @ceHeroNote.
  ///
  /// In en, this message translates to:
  /// **'An estimate of this cycle’s reward. It is confirmed when the month closes.'**
  String get ceHeroNote;

  /// No description provided for @ceByLevelTitle.
  ///
  /// In en, this message translates to:
  /// **'Earnings by Reach level'**
  String get ceByLevelTitle;

  /// No description provided for @ceByLevelBody.
  ///
  /// In en, this message translates to:
  /// **'Where the views behind your estimate came from.'**
  String get ceByLevelBody;

  /// No description provided for @ceLevelTotal.
  ///
  /// In en, this message translates to:
  /// **'Estimated total'**
  String get ceLevelTotal;

  /// No description provided for @ceMonthsTitle.
  ///
  /// In en, this message translates to:
  /// **'Last 6 months'**
  String get ceMonthsTitle;

  /// No description provided for @ceMonthsLabel.
  ///
  /// In en, this message translates to:
  /// **'Monthly earnings for the last 6 months. This month: {amount}'**
  String ceMonthsLabel(String amount);

  /// No description provided for @ceRewardTitle.
  ///
  /// In en, this message translates to:
  /// **'Qualified Creator Reward'**
  String get ceRewardTitle;

  /// No description provided for @ceRewardBody.
  ///
  /// In en, this message translates to:
  /// **'Your reward is not a fixed amount per view. It depends on the quality of the attention your content earns.'**
  String get ceRewardBody;

  /// No description provided for @ceReachLevel.
  ///
  /// In en, this message translates to:
  /// **'Reach level'**
  String get ceReachLevel;

  /// No description provided for @cePoolTitle.
  ///
  /// In en, this message translates to:
  /// **'Reward pool'**
  String get cePoolTitle;

  /// No description provided for @cePoolBody.
  ///
  /// In en, this message translates to:
  /// **'{reach} qualified reach so far ({period}). Creators share the monthly pool in proportion to their qualified reach and its quality.'**
  String cePoolBody(String reach, String period);

  /// No description provided for @cePoolNote.
  ///
  /// In en, this message translates to:
  /// **'Estimated. The pool and each share are final only when the month closes.'**
  String get cePoolNote;

  /// No description provided for @ceHowItWorks.
  ///
  /// In en, this message translates to:
  /// **'How rewards work'**
  String get ceHowItWorks;

  /// No description provided for @ceHowTitle.
  ///
  /// In en, this message translates to:
  /// **'How the Qualified Creator Reward works'**
  String get ceHowTitle;

  /// No description provided for @ceHow1.
  ///
  /// In en, this message translates to:
  /// **'Only qualified views count: real people, counted once, who watched for long enough.'**
  String get ceHow1;

  /// No description provided for @ceHow2.
  ///
  /// In en, this message translates to:
  /// **'Watch time, shares, saves and engagement show how much people valued your content.'**
  String get ceHow2;

  /// No description provided for @ceHow3.
  ///
  /// In en, this message translates to:
  /// **'Your Reach level matters too: reaching further on the ladder lifts your share of the pool.'**
  String get ceHow3;

  /// No description provided for @ceHow4.
  ///
  /// In en, this message translates to:
  /// **'At the end of the month the pool is shared among creators, and your amount becomes final.'**
  String get ceHow4;

  /// No description provided for @ceHowDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Amounts shown are estimates. They can change after quality and fraud checks, and are never a promise of payment.'**
  String get ceHowDisclaimer;

  /// No description provided for @ceGoToPayout.
  ///
  /// In en, this message translates to:
  /// **'Go to Payout Center'**
  String get ceGoToPayout;

  /// No description provided for @kycTitle.
  ///
  /// In en, this message translates to:
  /// **'Identity verification'**
  String get kycTitle;

  /// No description provided for @kycFlowTitle.
  ///
  /// In en, this message translates to:
  /// **'Verify your identity'**
  String get kycFlowTitle;

  /// No description provided for @kycNotStarted.
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get kycNotStarted;

  /// No description provided for @kycPending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get kycPending;

  /// No description provided for @kycUnderReview.
  ///
  /// In en, this message translates to:
  /// **'Under review'**
  String get kycUnderReview;

  /// No description provided for @kycVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get kycVerified;

  /// No description provided for @kycRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get kycRejected;

  /// No description provided for @kycActionRequired.
  ///
  /// In en, this message translates to:
  /// **'Action required'**
  String get kycActionRequired;

  /// No description provided for @kycExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get kycExpired;

  /// No description provided for @kycHintNotStarted.
  ///
  /// In en, this message translates to:
  /// **'Verify your identity to receive payouts.'**
  String get kycHintNotStarted;

  /// No description provided for @kycHintPending.
  ///
  /// In en, this message translates to:
  /// **'We have your documents and will start the review shortly.'**
  String get kycHintPending;

  /// No description provided for @kycHintUnderReview.
  ///
  /// In en, this message translates to:
  /// **'Your documents are being reviewed. You will be notified when it is done.'**
  String get kycHintUnderReview;

  /// No description provided for @kycHintVerified.
  ///
  /// In en, this message translates to:
  /// **'Your identity is verified. You can receive payouts.'**
  String get kycHintVerified;

  /// No description provided for @kycHintRejected.
  ///
  /// In en, this message translates to:
  /// **'We could not verify your identity from these documents.'**
  String get kycHintRejected;

  /// No description provided for @kycHintActionRequired.
  ///
  /// In en, this message translates to:
  /// **'We need a clearer or different document to continue.'**
  String get kycHintActionRequired;

  /// No description provided for @kycHintExpired.
  ///
  /// In en, this message translates to:
  /// **'Your verification has expired. Renew it to keep receiving payouts.'**
  String get kycHintExpired;

  /// No description provided for @kycReasonMismatch.
  ///
  /// In en, this message translates to:
  /// **'The name or details did not match the document.'**
  String get kycReasonMismatch;

  /// No description provided for @kycReasonUnreadable.
  ///
  /// In en, this message translates to:
  /// **'The document could not be read clearly.'**
  String get kycReasonUnreadable;

  /// No description provided for @kycReasonBlurry.
  ///
  /// In en, this message translates to:
  /// **'The picture was too blurry.'**
  String get kycReasonBlurry;

  /// No description provided for @kycReasonExpiredDocument.
  ///
  /// In en, this message translates to:
  /// **'The document has expired.'**
  String get kycReasonExpiredDocument;

  /// No description provided for @kycReasonGeneric.
  ///
  /// In en, this message translates to:
  /// **'Please check your details and try again.'**
  String get kycReasonGeneric;

  /// No description provided for @kycIndividual.
  ///
  /// In en, this message translates to:
  /// **'Individual'**
  String get kycIndividual;

  /// No description provided for @kycBusiness.
  ///
  /// In en, this message translates to:
  /// **'Business'**
  String get kycBusiness;

  /// No description provided for @kycIndividualBody.
  ///
  /// In en, this message translates to:
  /// **'Verify yourself with a government ID.'**
  String get kycIndividualBody;

  /// No description provided for @kycBusinessBody.
  ///
  /// In en, this message translates to:
  /// **'Verify a business with its registration and an authorised person.'**
  String get kycBusinessBody;

  /// No description provided for @kycDocReceived.
  ///
  /// In en, this message translates to:
  /// **'Received'**
  String get kycDocReceived;

  /// No description provided for @kycDocAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get kycDocAccepted;

  /// No description provided for @kycDocRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get kycDocRejected;

  /// No description provided for @kycDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Verification details'**
  String get kycDetailsTitle;

  /// No description provided for @kycType.
  ///
  /// In en, this message translates to:
  /// **'Type'**
  String get kycType;

  /// No description provided for @kycLegalName.
  ///
  /// In en, this message translates to:
  /// **'Full legal name'**
  String get kycLegalName;

  /// No description provided for @kycBusinessName.
  ///
  /// In en, this message translates to:
  /// **'Business name'**
  String get kycBusinessName;

  /// No description provided for @kycSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitted'**
  String get kycSubmitted;

  /// No description provided for @kycReviewed.
  ///
  /// In en, this message translates to:
  /// **'Reviewed'**
  String get kycReviewed;

  /// No description provided for @kycValidUntil.
  ///
  /// In en, this message translates to:
  /// **'Valid until'**
  String get kycValidUntil;

  /// No description provided for @kycDocumentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Documents'**
  String get kycDocumentsTitle;

  /// No description provided for @kycMaskedNote.
  ///
  /// In en, this message translates to:
  /// **'Numbers are always shown hidden. BLOCKS never shows a full ID number.'**
  String get kycMaskedNote;

  /// No description provided for @kycStart.
  ///
  /// In en, this message translates to:
  /// **'Start verification'**
  String get kycStart;

  /// No description provided for @kycRenew.
  ///
  /// In en, this message translates to:
  /// **'Renew verification'**
  String get kycRenew;

  /// No description provided for @kycTryAgain.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get kycTryAgain;

  /// No description provided for @kycCheckStatus.
  ///
  /// In en, this message translates to:
  /// **'Check status'**
  String get kycCheckStatus;

  /// No description provided for @kycPrivacyTitle.
  ///
  /// In en, this message translates to:
  /// **'How your documents are protected'**
  String get kycPrivacyTitle;

  /// No description provided for @kycPrivacy1.
  ///
  /// In en, this message translates to:
  /// **'Sent securely and stored encrypted in private storage.'**
  String get kycPrivacy1;

  /// No description provided for @kycPrivacy2.
  ///
  /// In en, this message translates to:
  /// **'Not kept on this phone after you send them.'**
  String get kycPrivacy2;

  /// No description provided for @kycPrivacy3.
  ///
  /// In en, this message translates to:
  /// **'Only a small, trained team can open them, and every access is logged.'**
  String get kycPrivacy3;

  /// No description provided for @kycPrivacy4.
  ///
  /// In en, this message translates to:
  /// **'They are deleted when the law no longer requires them to be kept.'**
  String get kycPrivacy4;

  /// No description provided for @kycStepOf.
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total}'**
  String kycStepOf(int current, int total);

  /// No description provided for @kycTypeTitle.
  ///
  /// In en, this message translates to:
  /// **'Who is being verified?'**
  String get kycTypeTitle;

  /// No description provided for @kycTypeBody.
  ///
  /// In en, this message translates to:
  /// **'Choose how you will receive payouts.'**
  String get kycTypeBody;

  /// No description provided for @kycDetailsHeading.
  ///
  /// In en, this message translates to:
  /// **'Your details'**
  String get kycDetailsHeading;

  /// No description provided for @kycDetailsBody.
  ///
  /// In en, this message translates to:
  /// **'Enter your name exactly as it appears on your document.'**
  String get kycDetailsBody;

  /// No description provided for @kycNameHelp.
  ///
  /// In en, this message translates to:
  /// **'Must match your document and your bank account.'**
  String get kycNameHelp;

  /// No description provided for @kycSignatoryName.
  ///
  /// In en, this message translates to:
  /// **'Authorised person’s full name'**
  String get kycSignatoryName;

  /// No description provided for @kycDocsHeading.
  ///
  /// In en, this message translates to:
  /// **'Your documents'**
  String get kycDocsHeading;

  /// No description provided for @kycDocsBody.
  ///
  /// In en, this message translates to:
  /// **'Choose a document, enter its number and add a clear picture.'**
  String get kycDocsBody;

  /// No description provided for @kycIdentityDoc.
  ///
  /// In en, this message translates to:
  /// **'Identity document'**
  String get kycIdentityDoc;

  /// No description provided for @kycBusinessDoc.
  ///
  /// In en, this message translates to:
  /// **'Business document'**
  String get kycBusinessDoc;

  /// No description provided for @kycSignatoryDoc.
  ///
  /// In en, this message translates to:
  /// **'Authorised person’s ID'**
  String get kycSignatoryDoc;

  /// No description provided for @kycNumber.
  ///
  /// In en, this message translates to:
  /// **'Number'**
  String get kycNumber;

  /// No description provided for @kycDocument.
  ///
  /// In en, this message translates to:
  /// **'Document'**
  String get kycDocument;

  /// No description provided for @kycFile.
  ///
  /// In en, this message translates to:
  /// **'File'**
  String get kycFile;

  /// No description provided for @kycFileBack.
  ///
  /// In en, this message translates to:
  /// **'Back side'**
  String get kycFileBack;

  /// No description provided for @kycFront.
  ///
  /// In en, this message translates to:
  /// **'Front'**
  String get kycFront;

  /// No description provided for @kycBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get kycBack;

  /// No description provided for @kycUploadFront.
  ///
  /// In en, this message translates to:
  /// **'Upload a picture'**
  String get kycUploadFront;

  /// No description provided for @kycUploadBack.
  ///
  /// In en, this message translates to:
  /// **'Upload the back'**
  String get kycUploadBack;

  /// No description provided for @kycNoFile.
  ///
  /// In en, this message translates to:
  /// **'No file chosen'**
  String get kycNoFile;

  /// No description provided for @kycChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose'**
  String get kycChoose;

  /// No description provided for @kycRemoveFile.
  ///
  /// In en, this message translates to:
  /// **'Remove file'**
  String get kycRemoveFile;

  /// No description provided for @kycFileRules.
  ///
  /// In en, this message translates to:
  /// **'Up to {mb} MB. Accepted: {types}.'**
  String kycFileRules(int mb, String types);

  /// No description provided for @kycFileNote.
  ///
  /// In en, this message translates to:
  /// **'Your file is sent securely and is not kept on this phone.'**
  String get kycFileNote;

  /// No description provided for @kycFileCamera.
  ///
  /// In en, this message translates to:
  /// **'Take a photo'**
  String get kycFileCamera;

  /// No description provided for @kycFileGallery.
  ///
  /// In en, this message translates to:
  /// **'Choose from gallery'**
  String get kycFileGallery;

  /// No description provided for @kycFilePdf.
  ///
  /// In en, this message translates to:
  /// **'Choose a PDF'**
  String get kycFilePdf;

  /// No description provided for @kycFileDemoLarge.
  ///
  /// In en, this message translates to:
  /// **'Demo: a file that is too large'**
  String get kycFileDemoLarge;

  /// No description provided for @kycErrName.
  ///
  /// In en, this message translates to:
  /// **'Enter your full name using letters only.'**
  String get kycErrName;

  /// No description provided for @kycErrBusiness.
  ///
  /// In en, this message translates to:
  /// **'Enter the business name.'**
  String get kycErrBusiness;

  /// No description provided for @kycErrNumber.
  ///
  /// In en, this message translates to:
  /// **'That number does not look right for this document.'**
  String get kycErrNumber;

  /// No description provided for @kycErrFileLarge.
  ///
  /// In en, this message translates to:
  /// **'That file is too large.'**
  String get kycErrFileLarge;

  /// No description provided for @kycErrFileType.
  ///
  /// In en, this message translates to:
  /// **'That file type is not accepted.'**
  String get kycErrFileType;

  /// No description provided for @kycErrFileMissing.
  ///
  /// In en, this message translates to:
  /// **'Add a picture of the document.'**
  String get kycErrFileMissing;

  /// No description provided for @kycErrDocMissing.
  ///
  /// In en, this message translates to:
  /// **'Choose a document and add it.'**
  String get kycErrDocMissing;

  /// No description provided for @kycErrDocUnsupported.
  ///
  /// In en, this message translates to:
  /// **'That document is not accepted here.'**
  String get kycErrDocUnsupported;

  /// No description provided for @kycReviewHeading.
  ///
  /// In en, this message translates to:
  /// **'Check and submit'**
  String get kycReviewHeading;

  /// No description provided for @kycReviewBody.
  ///
  /// In en, this message translates to:
  /// **'Make sure everything is right. Numbers are shown hidden.'**
  String get kycReviewBody;

  /// No description provided for @kycReviewWarning.
  ///
  /// In en, this message translates to:
  /// **'Your documents are sent securely for review. Providing false information can lead to your account being restricted.'**
  String get kycReviewWarning;

  /// No description provided for @kycSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit for verification'**
  String get kycSubmit;

  /// No description provided for @kycProcessingNote.
  ///
  /// In en, this message translates to:
  /// **'This usually takes a moment. You can leave this screen; we will tell you when it is done.'**
  String get kycProcessingNote;

  /// No description provided for @kycStepReceived.
  ///
  /// In en, this message translates to:
  /// **'Documents received'**
  String get kycStepReceived;

  /// No description provided for @kycStepReview.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get kycStepReview;

  /// No description provided for @kycStepResult.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get kycStepResult;

  /// No description provided for @bankEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No bank account yet'**
  String get bankEmptyTitle;

  /// No description provided for @bankEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Add the account you want payouts sent to.'**
  String get bankEmptyBody;

  /// No description provided for @bankAdd.
  ///
  /// In en, this message translates to:
  /// **'Add bank account'**
  String get bankAdd;

  /// No description provided for @bankAddTitle.
  ///
  /// In en, this message translates to:
  /// **'Add bank account'**
  String get bankAddTitle;

  /// No description provided for @bankSecurityNote.
  ///
  /// In en, this message translates to:
  /// **'Adding, changing or removing a bank account asks for your password and a code, and BLOCKS e-mails you about it.'**
  String get bankSecurityNote;

  /// No description provided for @bankPrimary.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get bankPrimary;

  /// No description provided for @bankMakePrimary.
  ///
  /// In en, this message translates to:
  /// **'Make primary'**
  String get bankMakePrimary;

  /// No description provided for @bankRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get bankRemove;

  /// No description provided for @bankRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove this account?'**
  String get bankRemoveTitle;

  /// No description provided for @bankRemoveBody.
  ///
  /// In en, this message translates to:
  /// **'{bank} •••• {last4} will no longer receive payouts.'**
  String bankRemoveBody(String bank, String last4);

  /// No description provided for @bankRemoved.
  ///
  /// In en, this message translates to:
  /// **'Bank account removed'**
  String get bankRemoved;

  /// No description provided for @bankPrimaryNow.
  ///
  /// In en, this message translates to:
  /// **'This is now your primary account'**
  String get bankPrimaryNow;

  /// No description provided for @bankCardLabel.
  ///
  /// In en, this message translates to:
  /// **'{bank} account ending {last4}, {status}'**
  String bankCardLabel(String bank, String last4, String status);

  /// No description provided for @bankHolder.
  ///
  /// In en, this message translates to:
  /// **'Account holder'**
  String get bankHolder;

  /// No description provided for @bankHolderHelp.
  ///
  /// In en, this message translates to:
  /// **'Exactly as on your bank account.'**
  String get bankHolderHelp;

  /// No description provided for @bankAccountNumber.
  ///
  /// In en, this message translates to:
  /// **'Account number'**
  String get bankAccountNumber;

  /// No description provided for @bankConfirmAccount.
  ///
  /// In en, this message translates to:
  /// **'Confirm account number'**
  String get bankConfirmAccount;

  /// No description provided for @bankIfsc.
  ///
  /// In en, this message translates to:
  /// **'IFSC code'**
  String get bankIfsc;

  /// No description provided for @bankBranch.
  ///
  /// In en, this message translates to:
  /// **'Branch'**
  String get bankBranch;

  /// No description provided for @bankType.
  ///
  /// In en, this message translates to:
  /// **'Account type'**
  String get bankType;

  /// No description provided for @bankSavings.
  ///
  /// In en, this message translates to:
  /// **'Savings'**
  String get bankSavings;

  /// No description provided for @bankCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get bankCurrent;

  /// No description provided for @bankFormNote.
  ///
  /// In en, this message translates to:
  /// **'Your account number is sent once, securely, and then never shown again. Only the last 4 digits stay visible.'**
  String get bankFormNote;

  /// No description provided for @bankSaveAndVerify.
  ///
  /// In en, this message translates to:
  /// **'Save and verify'**
  String get bankSaveAndVerify;

  /// No description provided for @bankVerifyingNow.
  ///
  /// In en, this message translates to:
  /// **'Checking with your bank…'**
  String get bankVerifyingNow;

  /// No description provided for @bankEditDetails.
  ///
  /// In en, this message translates to:
  /// **'Edit details'**
  String get bankEditDetails;

  /// No description provided for @bankManageAccounts.
  ///
  /// In en, this message translates to:
  /// **'Manage bank accounts'**
  String get bankManageAccounts;

  /// No description provided for @bankAwaitingIdentity.
  ///
  /// In en, this message translates to:
  /// **'Waiting for identity check'**
  String get bankAwaitingIdentity;

  /// No description provided for @bankVerifying.
  ///
  /// In en, this message translates to:
  /// **'Verifying'**
  String get bankVerifying;

  /// No description provided for @bankVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get bankVerified;

  /// No description provided for @bankNameMismatch.
  ///
  /// In en, this message translates to:
  /// **'Name doesn’t match'**
  String get bankNameMismatch;

  /// No description provided for @bankFailed.
  ///
  /// In en, this message translates to:
  /// **'Verification failed'**
  String get bankFailed;

  /// No description provided for @bankHintAwaitingIdentity.
  ///
  /// In en, this message translates to:
  /// **'Saved. We will check the name as soon as your identity is verified.'**
  String get bankHintAwaitingIdentity;

  /// No description provided for @bankHintVerifying.
  ///
  /// In en, this message translates to:
  /// **'We are checking this account with the bank.'**
  String get bankHintVerifying;

  /// No description provided for @bankHintVerified.
  ///
  /// In en, this message translates to:
  /// **'This account can receive payouts.'**
  String get bankHintVerified;

  /// No description provided for @bankHintNameMismatch.
  ///
  /// In en, this message translates to:
  /// **'The account holder’s name must match your verified identity. Edit the details or remove the account.'**
  String get bankHintNameMismatch;

  /// No description provided for @bankHintFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not verify this account. Check the details and try again.'**
  String get bankHintFailed;

  /// No description provided for @bankErrHolderRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the account holder’s name.'**
  String get bankErrHolderRequired;

  /// No description provided for @bankErrHolderInvalid.
  ///
  /// In en, this message translates to:
  /// **'Use letters only for the name.'**
  String get bankErrHolderInvalid;

  /// No description provided for @bankErrAccountRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the account number.'**
  String get bankErrAccountRequired;

  /// No description provided for @bankErrAccountInvalid.
  ///
  /// In en, this message translates to:
  /// **'Account numbers have 9 to 18 digits.'**
  String get bankErrAccountInvalid;

  /// No description provided for @bankErrDuplicate.
  ///
  /// In en, this message translates to:
  /// **'This account is already added.'**
  String get bankErrDuplicate;

  /// No description provided for @bankErrConfirmRequired.
  ///
  /// In en, this message translates to:
  /// **'Type the account number again.'**
  String get bankErrConfirmRequired;

  /// No description provided for @bankErrConfirmMismatch.
  ///
  /// In en, this message translates to:
  /// **'The two account numbers do not match.'**
  String get bankErrConfirmMismatch;

  /// No description provided for @bankErrIfscRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the IFSC code.'**
  String get bankErrIfscRequired;

  /// No description provided for @bankErrIfscInvalid.
  ///
  /// In en, this message translates to:
  /// **'An IFSC has 11 characters, like HDFC0001234.'**
  String get bankErrIfscInvalid;

  /// No description provided for @bankErrIfscUnknown.
  ///
  /// In en, this message translates to:
  /// **'We do not recognise this IFSC.'**
  String get bankErrIfscUnknown;

  /// No description provided for @poTitle.
  ///
  /// In en, this message translates to:
  /// **'Payout Center'**
  String get poTitle;

  /// No description provided for @poTabOverview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get poTabOverview;

  /// No description provided for @poTabMethods.
  ///
  /// In en, this message translates to:
  /// **'Methods'**
  String get poTabMethods;

  /// No description provided for @poTabVerification.
  ///
  /// In en, this message translates to:
  /// **'Verification'**
  String get poTabVerification;

  /// No description provided for @poTabHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get poTabHistory;

  /// No description provided for @poAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available to withdraw'**
  String get poAvailable;

  /// No description provided for @poPendingPaid.
  ///
  /// In en, this message translates to:
  /// **'Pending {pending} · Paid {paid}'**
  String poPendingPaid(String pending, String paid);

  /// No description provided for @poOpenTitle.
  ///
  /// In en, this message translates to:
  /// **'Payout of {amount} in progress'**
  String poOpenTitle(String amount);

  /// No description provided for @poArrival.
  ///
  /// In en, this message translates to:
  /// **'Expected {from} – {to}'**
  String poArrival(String from, String to);

  /// No description provided for @poEligibilityTitle.
  ///
  /// In en, this message translates to:
  /// **'Withdrawal checklist'**
  String get poEligibilityTitle;

  /// No description provided for @poEligibilityBody.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS checks these before every payout.'**
  String get poEligibilityBody;

  /// No description provided for @elIdentity.
  ///
  /// In en, this message translates to:
  /// **'Identity verified'**
  String get elIdentity;

  /// No description provided for @elBank.
  ///
  /// In en, this message translates to:
  /// **'Bank account verified'**
  String get elBank;

  /// No description provided for @elMinimum.
  ///
  /// In en, this message translates to:
  /// **'Balance of at least {minimum}'**
  String elMinimum(String minimum);

  /// No description provided for @elNoHold.
  ///
  /// In en, this message translates to:
  /// **'No safety hold on payouts'**
  String get elNoHold;

  /// No description provided for @elStanding.
  ///
  /// In en, this message translates to:
  /// **'Account in good standing'**
  String get elStanding;

  /// No description provided for @poNotYet.
  ///
  /// In en, this message translates to:
  /// **'not yet'**
  String get poNotYet;

  /// No description provided for @poActionVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify identity'**
  String get poActionVerify;

  /// No description provided for @poActionAddBank.
  ///
  /// In en, this message translates to:
  /// **'Add bank'**
  String get poActionAddBank;

  /// No description provided for @poActionFixBank.
  ///
  /// In en, this message translates to:
  /// **'Fix bank'**
  String get poActionFixBank;

  /// No description provided for @poHoldUntil.
  ///
  /// In en, this message translates to:
  /// **'Paused until {date}'**
  String poHoldUntil(String date);

  /// No description provided for @poRulesTitle.
  ///
  /// In en, this message translates to:
  /// **'Payout rules'**
  String get poRulesTitle;

  /// No description provided for @poRuleMinimum.
  ///
  /// In en, this message translates to:
  /// **'Minimum withdrawal {amount}.'**
  String poRuleMinimum(String amount);

  /// No description provided for @poRuleTiming.
  ///
  /// In en, this message translates to:
  /// **'Money arrives in {minDays} to {maxDays} business days.'**
  String poRuleTiming(int minDays, int maxDays);

  /// No description provided for @poRuleStepUp.
  ///
  /// In en, this message translates to:
  /// **'Withdrawals of {amount} or more need an extra confirmation.'**
  String poRuleStepUp(String amount);

  /// No description provided for @poRuleHold.
  ///
  /// In en, this message translates to:
  /// **'Payouts pause for {hours} hours after a bank account change.'**
  String poRuleHold(int hours);

  /// No description provided for @poBlockedBy.
  ///
  /// In en, this message translates to:
  /// **'Not ready yet: {reason}'**
  String poBlockedBy(String reason);

  /// No description provided for @poRequest.
  ///
  /// In en, this message translates to:
  /// **'Request payout'**
  String get poRequest;

  /// No description provided for @poTaxInfo.
  ///
  /// In en, this message translates to:
  /// **'Tax information'**
  String get poTaxInfo;

  /// No description provided for @poHistoryEmpty.
  ///
  /// In en, this message translates to:
  /// **'No payouts yet'**
  String get poHistoryEmpty;

  /// No description provided for @poHistoryEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Your payouts will appear here.'**
  String get poHistoryEmptyBody;

  /// No description provided for @poRequested.
  ///
  /// In en, this message translates to:
  /// **'Requested'**
  String get poRequested;

  /// No description provided for @poProcessing.
  ///
  /// In en, this message translates to:
  /// **'Processing'**
  String get poProcessing;

  /// No description provided for @poCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get poCompleted;

  /// No description provided for @poFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get poFailed;

  /// No description provided for @poReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get poReversed;

  /// No description provided for @poOnHold.
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get poOnHold;

  /// No description provided for @poReasonBankRejected.
  ///
  /// In en, this message translates to:
  /// **'The bank could not accept this payment. The money is back in your balance.'**
  String get poReasonBankRejected;

  /// No description provided for @poReasonBankReturned.
  ///
  /// In en, this message translates to:
  /// **'The bank returned this payment. The money is back in your balance.'**
  String get poReasonBankReturned;

  /// No description provided for @poReasonSecurityReview.
  ///
  /// In en, this message translates to:
  /// **'Held for a security check. We will update you.'**
  String get poReasonSecurityReview;

  /// No description provided for @poReasonGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong with this payout.'**
  String get poReasonGeneric;

  /// No description provided for @poPaidOn.
  ///
  /// In en, this message translates to:
  /// **'Paid on {date}'**
  String poPaidOn(String date);

  /// No description provided for @poRequestedOn.
  ///
  /// In en, this message translates to:
  /// **'Requested {date}'**
  String poRequestedOn(String date);

  /// No description provided for @poReference.
  ///
  /// In en, this message translates to:
  /// **'Reference {reference}'**
  String poReference(String reference);

  /// No description provided for @poTileLabel.
  ///
  /// In en, this message translates to:
  /// **'Payout of {amount}, {status}, requested {date}'**
  String poTileLabel(String amount, String status, String date);

  /// No description provided for @poRequestTitle.
  ///
  /// In en, this message translates to:
  /// **'Request payout'**
  String get poRequestTitle;

  /// No description provided for @poMinimumIs.
  ///
  /// In en, this message translates to:
  /// **'Minimum {amount}'**
  String poMinimumIs(String amount);

  /// No description provided for @poAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount to withdraw'**
  String get poAmount;

  /// No description provided for @poAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get poAll;

  /// No description provided for @poSendTo.
  ///
  /// In en, this message translates to:
  /// **'Send to'**
  String get poSendTo;

  /// No description provided for @poSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'Summary'**
  String get poSummaryTitle;

  /// No description provided for @poTaxNote.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS does not calculate tax. If any deduction applies, the payout service applies it and shows it on your statement.'**
  String get poTaxNote;

  /// No description provided for @poReview.
  ///
  /// In en, this message translates to:
  /// **'Review payout'**
  String get poReview;

  /// No description provided for @poConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm payout'**
  String get poConfirmTitle;

  /// No description provided for @poConfirmAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get poConfirmAmount;

  /// No description provided for @poConfirmTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get poConfirmTo;

  /// No description provided for @poConfirmArrival.
  ///
  /// In en, this message translates to:
  /// **'Expected arrival'**
  String get poConfirmArrival;

  /// No description provided for @poConfirmNote.
  ///
  /// In en, this message translates to:
  /// **'The money is set aside from your balance now and sent to your bank.'**
  String get poConfirmNote;

  /// No description provided for @poConfirmStepUp.
  ///
  /// In en, this message translates to:
  /// **'This amount needs an extra confirmation with your password and a code.'**
  String get poConfirmStepUp;

  /// No description provided for @poConfirmButton.
  ///
  /// In en, this message translates to:
  /// **'Confirm {amount}'**
  String poConfirmButton(String amount);

  /// No description provided for @poNotReadyTitle.
  ///
  /// In en, this message translates to:
  /// **'You can’t withdraw yet'**
  String get poNotReadyTitle;

  /// No description provided for @poNotReadyBody.
  ///
  /// In en, this message translates to:
  /// **'Finish the steps in the Payout Center first.'**
  String get poNotReadyBody;

  /// No description provided for @poGoToCenter.
  ///
  /// In en, this message translates to:
  /// **'Open Payout Center'**
  String get poGoToCenter;

  /// No description provided for @poErrBelowMinimum.
  ///
  /// In en, this message translates to:
  /// **'That is below the minimum withdrawal.'**
  String get poErrBelowMinimum;

  /// No description provided for @poErrExceeds.
  ///
  /// In en, this message translates to:
  /// **'That is more than your available balance.'**
  String get poErrExceeds;

  /// No description provided for @poErrNotEligible.
  ///
  /// In en, this message translates to:
  /// **'You are not eligible to withdraw right now.'**
  String get poErrNotEligible;

  /// No description provided for @poErrOnHold.
  ///
  /// In en, this message translates to:
  /// **'Payouts are paused after your recent bank change.'**
  String get poErrOnHold;

  /// No description provided for @poErrNoBank.
  ///
  /// In en, this message translates to:
  /// **'Choose a bank account first.'**
  String get poErrNoBank;

  /// No description provided for @poErrStepUp.
  ///
  /// In en, this message translates to:
  /// **'The extra confirmation was missing or expired. Please try again.'**
  String get poErrStepUp;

  /// No description provided for @poSuccessTitle.
  ///
  /// In en, this message translates to:
  /// **'Payout requested'**
  String get poSuccessTitle;

  /// No description provided for @poSuccessBody.
  ///
  /// In en, this message translates to:
  /// **'{amount} is on its way to {bank}. Expected {window}.'**
  String poSuccessBody(String amount, String bank, String window);

  /// No description provided for @poViewHistory.
  ///
  /// In en, this message translates to:
  /// **'View history'**
  String get poViewHistory;

  /// No description provided for @suTitle.
  ///
  /// In en, this message translates to:
  /// **'Confirm it’s you'**
  String get suTitle;

  /// No description provided for @suWhyAddBank.
  ///
  /// In en, this message translates to:
  /// **'You are adding a payout account. Confirm it’s you first.'**
  String get suWhyAddBank;

  /// No description provided for @suWhyChangeBank.
  ///
  /// In en, this message translates to:
  /// **'You are changing your primary payout account. Confirm it’s you first.'**
  String get suWhyChangeBank;

  /// No description provided for @suWhyRemoveBank.
  ///
  /// In en, this message translates to:
  /// **'You are removing a payout account. Confirm it’s you first.'**
  String get suWhyRemoveBank;

  /// No description provided for @suWhyPayout.
  ///
  /// In en, this message translates to:
  /// **'This is a large withdrawal. Confirm it’s you first.'**
  String get suWhyPayout;

  /// No description provided for @suWhyTax.
  ///
  /// In en, this message translates to:
  /// **'You are changing your tax details. Confirm it’s you first.'**
  String get suWhyTax;

  /// No description provided for @suWrongPassword.
  ///
  /// In en, this message translates to:
  /// **'That password isn’t right.'**
  String get suWrongPassword;

  /// No description provided for @suConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get suConfirm;

  /// No description provided for @suNeverShare.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS will never ask for this code in a message or call. Never share it.'**
  String get suNeverShare;

  /// No description provided for @suCodeAuthenticator.
  ///
  /// In en, this message translates to:
  /// **'Enter the code from your authenticator app.'**
  String get suCodeAuthenticator;

  /// No description provided for @suCodeSentPhone.
  ///
  /// In en, this message translates to:
  /// **'We sent a code to {destination}.'**
  String suCodeSentPhone(String destination);

  /// No description provided for @suCodeSentEmail.
  ///
  /// In en, this message translates to:
  /// **'We sent a code to {destination}.'**
  String suCodeSentEmail(String destination);

  /// No description provided for @taxTitle.
  ///
  /// In en, this message translates to:
  /// **'Tax information'**
  String get taxTitle;

  /// No description provided for @taxPanTitle.
  ///
  /// In en, this message translates to:
  /// **'PAN'**
  String get taxPanTitle;

  /// No description provided for @taxPanLabel.
  ///
  /// In en, this message translates to:
  /// **'PAN number'**
  String get taxPanLabel;

  /// No description provided for @taxProvided.
  ///
  /// In en, this message translates to:
  /// **'Provided'**
  String get taxProvided;

  /// No description provided for @taxNotProvided.
  ///
  /// In en, this message translates to:
  /// **'Not provided yet'**
  String get taxNotProvided;

  /// No description provided for @taxUpdatedOn.
  ///
  /// In en, this message translates to:
  /// **'Updated {date}'**
  String taxUpdatedOn(String date);

  /// No description provided for @taxAdd.
  ///
  /// In en, this message translates to:
  /// **'Add PAN'**
  String get taxAdd;

  /// No description provided for @taxUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update PAN'**
  String get taxUpdate;

  /// No description provided for @taxSave.
  ///
  /// In en, this message translates to:
  /// **'Save PAN'**
  String get taxSave;

  /// No description provided for @taxSaved.
  ///
  /// In en, this message translates to:
  /// **'Tax information saved'**
  String get taxSaved;

  /// No description provided for @taxErrPan.
  ///
  /// In en, this message translates to:
  /// **'A PAN has 10 characters, like ABCDE1234F.'**
  String get taxErrPan;

  /// No description provided for @taxNote.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS collects this so the payout provider can meet tax rules. BLOCKS does not calculate tax in the app. If a deduction applies, the payout service applies and itemises it. The number is shown hidden after you save it.'**
  String get taxNote;

  /// No description provided for @cdTitle.
  ///
  /// In en, this message translates to:
  /// **'Creator and payouts'**
  String get cdTitle;

  /// No description provided for @cdIntro.
  ///
  /// In en, this message translates to:
  /// **'Steer the mock server so you can show the unhappy paths as well.'**
  String get cdIntro;

  /// No description provided for @cdStatus.
  ///
  /// In en, this message translates to:
  /// **'Identity: {kyc} · Available {balance} · {banks} bank accounts · {payouts} open payouts'**
  String cdStatus(String kyc, String balance, int banks, int payouts);

  /// No description provided for @cdKycOutcome.
  ///
  /// In en, this message translates to:
  /// **'Next identity review ends as'**
  String get cdKycOutcome;

  /// No description provided for @cdOutcomeVerified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get cdOutcomeVerified;

  /// No description provided for @cdOutcomeRejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get cdOutcomeRejected;

  /// No description provided for @cdOutcomeAction.
  ///
  /// In en, this message translates to:
  /// **'Action required'**
  String get cdOutcomeAction;

  /// No description provided for @cdPayoutOutcome.
  ///
  /// In en, this message translates to:
  /// **'Next payout ends as'**
  String get cdPayoutOutcome;

  /// No description provided for @cdPayCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get cdPayCompleted;

  /// No description provided for @cdPayFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get cdPayFailed;

  /// No description provided for @cdPayHold.
  ///
  /// In en, this message translates to:
  /// **'On hold'**
  String get cdPayHold;

  /// No description provided for @cdPayReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get cdPayReversed;

  /// No description provided for @cdPublishOutcome.
  ///
  /// In en, this message translates to:
  /// **'Next reel publish'**
  String get cdPublishOutcome;

  /// No description provided for @cdPubNormal.
  ///
  /// In en, this message translates to:
  /// **'Goes live'**
  String get cdPubNormal;

  /// No description provided for @cdPubUploadFails.
  ///
  /// In en, this message translates to:
  /// **'Upload fails once'**
  String get cdPubUploadFails;

  /// No description provided for @cdPubModeration.
  ///
  /// In en, this message translates to:
  /// **'Rejected by moderation'**
  String get cdPubModeration;

  /// No description provided for @cdPubNote.
  ///
  /// In en, this message translates to:
  /// **'Applies to the next publish only.'**
  String get cdPubNote;

  /// No description provided for @cdSafetyHold.
  ///
  /// In en, this message translates to:
  /// **'Pause payouts for 24 h after a bank change'**
  String get cdSafetyHold;

  /// No description provided for @cdSafetyHoldBody.
  ///
  /// In en, this message translates to:
  /// **'Shows the safety hold. Off by default so the walk-through is not blocked.'**
  String get cdSafetyHoldBody;

  /// No description provided for @cdOpenStudio.
  ///
  /// In en, this message translates to:
  /// **'Open Creator Studio'**
  String get cdOpenStudio;

  /// No description provided for @cdExpire.
  ///
  /// In en, this message translates to:
  /// **'Expire identity verification'**
  String get cdExpire;

  /// No description provided for @cdReset.
  ///
  /// In en, this message translates to:
  /// **'Reset creator and payout data'**
  String get cdReset;

  /// No description provided for @cdResetDone.
  ///
  /// In en, this message translates to:
  /// **'Creator and payout data reset'**
  String get cdResetDone;

  /// No description provided for @kycDob.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get kycDob;

  /// No description provided for @kycDobHelp.
  ///
  /// In en, this message translates to:
  /// **'You must be at least {age} years old.'**
  String kycDobHelp(int age);

  /// No description provided for @kycErrDobRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose your date of birth.'**
  String get kycErrDobRequired;

  /// No description provided for @kycErrDobInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid date of birth.'**
  String get kycErrDobInvalid;

  /// No description provided for @kycErrAge.
  ///
  /// In en, this message translates to:
  /// **'You must be at least {age} years old to be verified.'**
  String kycErrAge(int age);

  /// No description provided for @kycBusinessType.
  ///
  /// In en, this message translates to:
  /// **'Business type'**
  String get kycBusinessType;

  /// No description provided for @kycErrBusinessType.
  ///
  /// In en, this message translates to:
  /// **'Choose the type of business.'**
  String get kycErrBusinessType;

  /// No description provided for @kycVerifiedOn.
  ///
  /// In en, this message translates to:
  /// **'Verified on'**
  String get kycVerifiedOn;

  /// No description provided for @rsLanesTitle.
  ///
  /// In en, this message translates to:
  /// **'Text and stickers on the timeline'**
  String get rsLanesTitle;

  /// No description provided for @rsLanesHint.
  ///
  /// In en, this message translates to:
  /// **'Each bar shows when it is on screen. Tap one to edit it.'**
  String get rsLanesHint;

  /// No description provided for @rsLaneText.
  ///
  /// In en, this message translates to:
  /// **'Text “{content}”, on screen from {start} to {end}'**
  String rsLaneText(String content, String start, String end);

  /// No description provided for @rsLaneSticker.
  ///
  /// In en, this message translates to:
  /// **'Sticker {content}, on screen from {start} to {end}'**
  String rsLaneSticker(String content, String start, String end);

  /// No description provided for @taxAccountTitle.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get taxAccountTitle;

  /// No description provided for @taxAccountType.
  ///
  /// In en, this message translates to:
  /// **'Account type'**
  String get taxAccountType;

  /// No description provided for @taxAccountUnknown.
  ///
  /// In en, this message translates to:
  /// **'Not set yet'**
  String get taxAccountUnknown;

  /// No description provided for @taxDocsTitle.
  ///
  /// In en, this message translates to:
  /// **'Tax and payout documents'**
  String get taxDocsTitle;

  /// No description provided for @taxDocsBody.
  ///
  /// In en, this message translates to:
  /// **'Statements and any tax-withholding certificates your payout provider issues for your payouts appear here.'**
  String get taxDocsBody;

  /// No description provided for @taxDocsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No documents yet. They appear after your first completed payout.'**
  String get taxDocsEmpty;

  /// No description provided for @taxDocStatement.
  ///
  /// In en, this message translates to:
  /// **'Payout statement'**
  String get taxDocStatement;

  /// No description provided for @taxDocCertificate.
  ///
  /// In en, this message translates to:
  /// **'Tax withholding certificate'**
  String get taxDocCertificate;

  /// No description provided for @taxDocQuarter.
  ///
  /// In en, this message translates to:
  /// **'Quarter {quarter}, {year}'**
  String taxDocQuarter(int quarter, int year);

  /// No description provided for @taxDocReady.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get taxDocReady;

  /// No description provided for @taxDocLater.
  ///
  /// In en, this message translates to:
  /// **'Issued after the period ends, if it applies'**
  String get taxDocLater;

  /// No description provided for @csNavMusic.
  ///
  /// In en, this message translates to:
  /// **'Copyright & music'**
  String get csNavMusic;

  /// No description provided for @cmTitle.
  ///
  /// In en, this message translates to:
  /// **'Copyright and music'**
  String get cmTitle;

  /// No description provided for @cmIntro.
  ///
  /// In en, this message translates to:
  /// **'The tracks and original audio in your reels, and whether each can still be used.'**
  String get cmIntro;

  /// No description provided for @cmUsedTitle.
  ///
  /// In en, this message translates to:
  /// **'Music in your reels'**
  String get cmUsedTitle;

  /// No description provided for @cmUsedBody.
  ///
  /// In en, this message translates to:
  /// **'Tracks come from licensed, BLOCKS-owned or creator-owned catalogues.'**
  String get cmUsedBody;

  /// No description provided for @cmEmpty.
  ///
  /// In en, this message translates to:
  /// **'No music in your reels yet. Add a track when you create a reel.'**
  String get cmEmpty;

  /// No description provided for @cmStatusAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get cmStatusAvailable;

  /// No description provided for @cmStatusExpiring.
  ///
  /// In en, this message translates to:
  /// **'Licence ends soon'**
  String get cmStatusExpiring;

  /// No description provided for @cmStatusUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Not available for new reels'**
  String get cmStatusUnavailable;

  /// No description provided for @cmLicenceUntil.
  ///
  /// In en, this message translates to:
  /// **'Licence until {date}'**
  String cmLicenceUntil(String date);

  /// No description provided for @cmReasonExpired.
  ///
  /// In en, this message translates to:
  /// **'The licence for this track has ended.'**
  String get cmReasonExpired;

  /// No description provided for @cmReasonRegion.
  ///
  /// In en, this message translates to:
  /// **'This track is not licensed for use in your country.'**
  String get cmReasonRegion;

  /// No description provided for @cmReasonRestricted.
  ///
  /// In en, this message translates to:
  /// **'This track has no usable licence.'**
  String get cmReasonRestricted;

  /// No description provided for @cmReelsUsing.
  ///
  /// In en, this message translates to:
  /// **'Reels using it: {n}'**
  String cmReelsUsing(int n);

  /// No description provided for @cmOriginalTitle.
  ///
  /// In en, this message translates to:
  /// **'Your original audio'**
  String get cmOriginalTitle;

  /// No description provided for @cmOriginalBody.
  ///
  /// In en, this message translates to:
  /// **'Sound you recorded in your reels. Choose whether others can reuse it.'**
  String get cmOriginalBody;

  /// No description provided for @cmOriginalEmpty.
  ///
  /// In en, this message translates to:
  /// **'No original audio yet. Record sound in a reel and it appears here.'**
  String get cmOriginalEmpty;

  /// No description provided for @cmReuseLabel.
  ///
  /// In en, this message translates to:
  /// **'Others can reuse this audio'**
  String get cmReuseLabel;

  /// No description provided for @cmReuseOnDone.
  ///
  /// In en, this message translates to:
  /// **'Others can now reuse this audio'**
  String get cmReuseOnDone;

  /// No description provided for @cmReuseOffDone.
  ///
  /// In en, this message translates to:
  /// **'Others can no longer reuse this audio'**
  String get cmReuseOffDone;

  /// No description provided for @cmRightsNote.
  ///
  /// In en, this message translates to:
  /// **'BLOCKS checks rights again before every publish, and availability can change when a licence ends. This is not legal advice.'**
  String get cmRightsNote;

  /// No description provided for @authCreateAccount.
  ///
  /// In en, this message translates to:
  /// **'Create an account'**
  String get authCreateAccount;

  /// No description provided for @regTitle.
  ///
  /// In en, this message translates to:
  /// **'Create your account'**
  String get regTitle;

  /// No description provided for @regSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Join BLOCKS with your e-mail or phone number.'**
  String get regSubtitle;

  /// No description provided for @regName.
  ///
  /// In en, this message translates to:
  /// **'Full name'**
  String get regName;

  /// No description provided for @regUsername.
  ///
  /// In en, this message translates to:
  /// **'Username'**
  String get regUsername;

  /// No description provided for @regUsernameHelp.
  ///
  /// In en, this message translates to:
  /// **'3–30 letters, numbers, dots or underscores'**
  String get regUsernameHelp;

  /// No description provided for @regEmail.
  ///
  /// In en, this message translates to:
  /// **'E-mail'**
  String get regEmail;

  /// No description provided for @regPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get regPhone;

  /// No description provided for @regContactHelp.
  ///
  /// In en, this message translates to:
  /// **'Give an e-mail, a phone number, or both. We send a code to confirm it.'**
  String get regContactHelp;

  /// No description provided for @regPassword.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get regPassword;

  /// No description provided for @regDob.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get regDob;

  /// No description provided for @regDobHelp.
  ///
  /// In en, this message translates to:
  /// **'Only used to check you are 13 or older. Never shown to others.'**
  String get regDobHelp;

  /// No description provided for @regDobChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose your date of birth'**
  String get regDobChoose;

  /// No description provided for @regButton.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get regButton;

  /// No description provided for @regHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'I already have an account'**
  String get regHaveAccount;

  /// No description provided for @regErrRequired.
  ///
  /// In en, this message translates to:
  /// **'This is required'**
  String get regErrRequired;

  /// No description provided for @regErrInvalid.
  ///
  /// In en, this message translates to:
  /// **'That does not look right'**
  String get regErrInvalid;

  /// No description provided for @regErrUsername.
  ///
  /// In en, this message translates to:
  /// **'Use 3–30 letters, numbers, dots or underscores'**
  String get regErrUsername;

  /// No description provided for @regErrTaken.
  ///
  /// In en, this message translates to:
  /// **'That username is not available'**
  String get regErrTaken;

  /// No description provided for @regErrContact.
  ///
  /// In en, this message translates to:
  /// **'Enter an e-mail or a phone number'**
  String get regErrContact;

  /// No description provided for @regErrTooYoung.
  ///
  /// In en, this message translates to:
  /// **'You must be at least 13 to join'**
  String get regErrTooYoung;

  /// No description provided for @regErrPassword.
  ///
  /// In en, this message translates to:
  /// **'Choose a stronger password (longer, with upper and lower case letters, a number and a symbol)'**
  String get regErrPassword;

  /// No description provided for @cvTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter your code'**
  String get cvTitle;

  /// No description provided for @cvSentTo.
  ///
  /// In en, this message translates to:
  /// **'We sent a 6-digit code to {destination}.'**
  String cvSentTo(String destination);

  /// No description provided for @cvSent.
  ///
  /// In en, this message translates to:
  /// **'We sent you a 6-digit code.'**
  String get cvSent;

  /// No description provided for @cvApp.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code from your authenticator app.'**
  String get cvApp;

  /// No description provided for @cvRecovery.
  ///
  /// In en, this message translates to:
  /// **'Enter one of your recovery codes.'**
  String get cvRecovery;

  /// No description provided for @cvRecoveryLabel.
  ///
  /// In en, this message translates to:
  /// **'Recovery code'**
  String get cvRecoveryLabel;

  /// No description provided for @cvContactIntro.
  ///
  /// In en, this message translates to:
  /// **'Confirm it is you to finish creating your account.'**
  String get cvContactIntro;

  /// No description provided for @cvUnusualIntro.
  ///
  /// In en, this message translates to:
  /// **'This sign-in looks different from usual. Enter the code to confirm it is you.'**
  String get cvUnusualIntro;

  /// No description provided for @cvButton.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get cvButton;

  /// No description provided for @cvUseApp.
  ///
  /// In en, this message translates to:
  /// **'Use my authenticator app'**
  String get cvUseApp;

  /// No description provided for @cvUseSent.
  ///
  /// In en, this message translates to:
  /// **'Use the code we sent instead'**
  String get cvUseSent;

  /// No description provided for @cvUseRecovery.
  ///
  /// In en, this message translates to:
  /// **'Use a recovery code'**
  String get cvUseRecovery;

  /// No description provided for @cvChallengeGone.
  ///
  /// In en, this message translates to:
  /// **'This step has expired. Start again.'**
  String get cvChallengeGone;

  /// No description provided for @cvLocked.
  ///
  /// In en, this message translates to:
  /// **'Too many wrong codes. Request a new code to continue.'**
  String get cvLocked;

  /// No description provided for @cvWrong.
  ///
  /// In en, this message translates to:
  /// **'That code isn\'t right.'**
  String get cvWrong;

  /// No description provided for @epUsernameLocked.
  ///
  /// In en, this message translates to:
  /// **'Your username is chosen once and cannot be changed.'**
  String get epUsernameLocked;

  /// No description provided for @authSubtitleLive.
  ///
  /// In en, this message translates to:
  /// **'Create an account, or sign in to the one you already have.'**
  String get authSubtitleLive;

  /// No description provided for @settingsLogoutBodyLive.
  ///
  /// In en, this message translates to:
  /// **'You can sign back in any time with your username and password.'**
  String get settingsLogoutBodyLive;

  /// No description provided for @createPostedLive.
  ///
  /// In en, this message translates to:
  /// **'Your post is live'**
  String get createPostedLive;

  /// No description provided for @createChangePhoto.
  ///
  /// In en, this message translates to:
  /// **'Change photo'**
  String get createChangePhoto;

  /// No description provided for @createPhotoPreview.
  ///
  /// In en, this message translates to:
  /// **'Preview of your photo'**
  String get createPhotoPreview;

  /// No description provided for @createErrRestricted.
  ///
  /// In en, this message translates to:
  /// **'Your account can\'t post right now.'**
  String get createErrRestricted;

  /// No description provided for @createErrRateLimited.
  ///
  /// In en, this message translates to:
  /// **'You\'re posting too fast. Wait a moment and try again.'**
  String get createErrRateLimited;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'hi', 'te'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'hi':
      return AppLocalizationsHi();
    case 'te':
      return AppLocalizationsTe();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
