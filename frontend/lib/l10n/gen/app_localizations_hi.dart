// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appName => 'BLOCKS';

  @override
  String get tagline => 'आपके ब्लॉक से पूरी दुनिया तक।';

  @override
  String get madeInIndia => 'मेड इन इंडिया';

  @override
  String get splashLoadingSemantics => 'BLOCKS लोड हो रहा है। मेड इन इंडिया।';

  @override
  String get skip => 'छोड़ें';

  @override
  String get next => 'आगे';

  @override
  String get getStarted => 'शुरू करें';

  @override
  String get exploreDemo => 'डेमो देखें';

  @override
  String get continueAsDemoUser => 'डेमो यूज़र के रूप में जारी रखें';

  @override
  String pageIndicatorSemantics(int current, int total) {
    return 'पेज $current / $total';
  }

  @override
  String get onboarding1Title => 'BLOCKS में आपका स्वागत है';

  @override
  String get onboarding1Body =>
      'आपकी आवाज़ स्थानीय स्तर से शुरू होकर पूरी दुनिया तक पहुँच सकती है।';

  @override
  String get onboarding2Title => 'ज़िले से दुनिया तक';

  @override
  String get onboarding2Body =>
      'बेहतरीन पोस्ट फ़ॉलोअर संख्या से नहीं, बल्कि वास्तविक पहुँच से आगे बढ़ती हैं।';

  @override
  String get onboarding3Title => 'बनाएँ। साझा करें। बढ़ें।';

  @override
  String get onboarding3Body =>
      'अपने समुदाय के साथ पोस्ट, रील और स्टोरी साझा करें और उन्हें दूर तक पहुँचते देखें।';

  @override
  String get onboarding4Title => 'अपने प्रभाव से कमाएँ';

  @override
  String get onboarding4Body =>
      'कमाई वास्तविक पहुँच और भरोसे पर आधारित है, केवल व्यूज़ पर नहीं।';

  @override
  String get onboarding5Title => 'अपना बिज़नेस बढ़ाएँ';

  @override
  String get onboarding5Body =>
      'बिज़नेस पेज बनाएँ, आस-पास के ग्राहकों तक पहुँचें और अपनी ख़ास बातें प्रमोट करें।';

  @override
  String get levelDistrict => 'ज़िला';

  @override
  String get levelState => 'राज्य';

  @override
  String get levelNational => 'राष्ट्रीय';

  @override
  String get levelGlobal => 'वैश्विक';

  @override
  String levelBadgeSemantics(String code, String name) {
    return 'पहुँच स्तर $code, $name';
  }

  @override
  String get navHome => 'होम';

  @override
  String get navExplore => 'एक्सप्लोर';

  @override
  String get navCreate => 'बनाएँ';

  @override
  String get navReels => 'रील्स';

  @override
  String get navProfile => 'प्रोफ़ाइल';

  @override
  String get authTitle => 'BLOCKS में आपका स्वागत है';

  @override
  String get authSubtitle =>
      'यह एक डेमो अनुभव है। किसी खाते या इंटरनेट की ज़रूरत नहीं है।';

  @override
  String get authDemoCardCaption => 'डेमो क्रिएटर के रूप में साइन इन';

  @override
  String get authFootnote => 'डेमो डेटा आपके डिवाइस पर बनाया जाता है।';

  @override
  String get close => 'बंद करें';

  @override
  String get retry => 'फिर कोशिश करें';

  @override
  String get emptyTitle => 'यहाँ अभी कुछ नहीं है';

  @override
  String get emptyBody => 'कुछ नया बनाने वाले पहले व्यक्ति बनें।';

  @override
  String get errorTitle => 'कुछ गड़बड़ हो गई';

  @override
  String get errorBody => 'कृपया अपना कनेक्शन जाँचें और फिर कोशिश करें।';

  @override
  String get unavailableTitle => 'अभी उपलब्ध नहीं है';

  @override
  String get unavailableBody =>
      'BLOCKS का यह हिस्सा अभी आपके खाते के लिए चालू नहीं है। कृपया थोड़ी देर बाद फिर देखें।';

  @override
  String get loading => 'लोड हो रहा है';

  @override
  String get feedFollowing => 'फ़ॉलोइंग';

  @override
  String get feedForYou => 'आपके लिए';

  @override
  String get feedRising => 'उभरते';

  @override
  String get feedNearYou => 'आपके पास';

  @override
  String get feedIndia => 'भारत';

  @override
  String get searchTooltip => 'खोजें';

  @override
  String get notificationsTooltip => 'सूचनाएँ';

  @override
  String get profileTooltip => 'आपकी प्रोफ़ाइल';

  @override
  String get messagesTooltip => 'संदेश';

  @override
  String get yourStory => 'आपकी स्टोरी';

  @override
  String storyOfSemantics(String name) {
    return '$name की स्टोरी';
  }

  @override
  String get addToStorySemantics => 'अपनी स्टोरी में जोड़ें';

  @override
  String get postMoreOptions => 'और विकल्प';

  @override
  String get actionLike => 'पसंद';

  @override
  String get actionUnlike => 'पसंद हटाएँ';

  @override
  String get actionComment => 'टिप्पणी';

  @override
  String get actionShare => 'साझा करें';

  @override
  String get actionSave => 'सहेजें';

  @override
  String get actionUnsave => 'सहेजे से हटाएँ';

  @override
  String likeSemantics(String label, String count) {
    return '$label, $count पसंद';
  }

  @override
  String commentSemantics(String count) {
    return 'टिप्पणियाँ, $count';
  }

  @override
  String shareSemantics(String count) {
    return 'साझा करें, $count शेयर';
  }

  @override
  String get captionMore => 'और';

  @override
  String get captionLess => 'कम';

  @override
  String get postSaved => 'आपके संग्रह में सहेजा गया';

  @override
  String get postUnsaved => 'सहेजे से हटाया गया';

  @override
  String postCardSemantics(String name, String location) {
    return '$location से $name की पोस्ट';
  }

  @override
  String get videoLabel => 'वीडियो';

  @override
  String get risingBadge => 'उभरता';

  @override
  String risingOwn(int percent, String level) {
    return 'आपकी पोस्ट $level स्तर की ओर $percent% पहुँच चुकी है';
  }

  @override
  String risingOther(int percent, String level) {
    return 'यह पोस्ट $level स्तर की ओर $percent% पहुँच चुकी है';
  }

  @override
  String get risingCurrent => 'वर्तमान';

  @override
  String get risingNext => 'अगला';

  @override
  String risingRemaining(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return '$countString और योग्य इंटरैक्शन चाहिए';
  }

  @override
  String get risingTopLevel => 'सीढ़ी के शीर्ष पर पहुँच गए';

  @override
  String ladderSemantics(String summary) {
    return 'पहुँच की सीढ़ी। $summary';
  }

  @override
  String ladderReachedSemantics(String level) {
    return '$level प्राप्त';
  }

  @override
  String ladderProgressSemantics(String level, int percent) {
    return '$level $percent प्रतिशत';
  }

  @override
  String ladderLockedSemantics(String level) {
    return '$level बंद';
  }

  @override
  String get reachJourney => 'पहुँच की यात्रा';

  @override
  String get reachQualifiedLabel => 'योग्य पहुँच';

  @override
  String get reachSimulateBoost => 'पहुँच बढ़ाने का डेमो';

  @override
  String get reachBoostDone => 'डेमो के लिए पहुँच बढ़ाई गई';

  @override
  String get reachExplain =>
      'केवल योग्य पहुँच गिनी जाती है: असली, अलग-अलग दर्शक और सार्थक जुड़ाव।';

  @override
  String get statViews => 'व्यूज़';

  @override
  String get statLikes => 'पसंद';

  @override
  String get statComments => 'टिप्पणियाँ';

  @override
  String get statShares => 'शेयर';

  @override
  String get statSaves => 'सहेजे';

  @override
  String levelUnlockedTitle(String level) {
    return 'आप $level स्तर पर पहुँच गए!';
  }

  @override
  String levelUnlockedBody(String level) {
    return 'आपका कंटेंट अब $level डिस्कवरी के योग्य है।';
  }

  @override
  String get celebrationContinue => 'शानदार';

  @override
  String get commentsTitle => 'टिप्पणियाँ';

  @override
  String get commentsHint => 'टिप्पणी जोड़ें…';

  @override
  String get commentPost => 'पोस्ट';

  @override
  String get commentsEmptyTitle => 'अभी कोई टिप्पणी नहीं';

  @override
  String get commentsEmptyBody => 'बातचीत शुरू करें।';

  @override
  String viewAllComments(String count) {
    return 'सभी $count टिप्पणियाँ देखें';
  }

  @override
  String get shareTitle => 'साझा करें';

  @override
  String get shareSubtitle => 'नए ज़िले से हर शेयर इस पोस्ट को आगे बढ़ाता है।';

  @override
  String get shareCopyLink => 'लिंक कॉपी करें';

  @override
  String get shareToStory => 'स्टोरी में जोड़ें';

  @override
  String get shareInMessage => 'संदेश में भेजें';

  @override
  String get shareMore => 'और';

  @override
  String get linkCopied => 'लिंक कॉपी हो गया';

  @override
  String get sharedToast => 'साझा किया गया';

  @override
  String get actionReport => 'रिपोर्ट करें';

  @override
  String actionMute(String username) {
    return '$username को म्यूट करें';
  }

  @override
  String actionBlock(String username) {
    return '$username को ब्लॉक करें';
  }

  @override
  String actionRestrict(String username) {
    return '$username को सीमित करें';
  }

  @override
  String confirmBlockTitle(String username) {
    return '$username को ब्लॉक करें?';
  }

  @override
  String get confirmBlockBody =>
      'वे आपकी प्रोफ़ाइल नहीं ढूँढ पाएँगे और आप उनकी पोस्ट नहीं देखेंगे।';

  @override
  String get cancel => 'रद्द करें';

  @override
  String mutedToast(String username) {
    return '$username म्यूट किया गया';
  }

  @override
  String blockedToast(String username) {
    return '$username ब्लॉक किया गया';
  }

  @override
  String restrictedToast(String username) {
    return '$username सीमित किया गया';
  }

  @override
  String get reportTitle => 'आप इसे रिपोर्ट क्यों कर रहे हैं?';

  @override
  String get reportSubtitle => 'आपकी रिपोर्ट गोपनीय है।';

  @override
  String get reasonSpam => 'स्पैम';

  @override
  String get reasonHarassment => 'उत्पीड़न';

  @override
  String get reasonNudity => 'नग्नता / यौन सामग्री';

  @override
  String get reasonViolence => 'हिंसा';

  @override
  String get reasonSelfHarm => 'स्वयं को नुकसान';

  @override
  String get reasonMisinformation => 'गलत जानकारी';

  @override
  String get reasonScam => 'धोखाधड़ी';

  @override
  String get reasonOther => 'अन्य';

  @override
  String get reportDetailsHint => 'विवरण जोड़ें (वैकल्पिक)';

  @override
  String get reportSubmit => 'रिपोर्ट भेजें';

  @override
  String get reportThanksTitle => 'हमें बताने के लिए धन्यवाद';

  @override
  String get reportThanksBody =>
      'हम इसे अपनी कम्युनिटी गाइडलाइन्स के अनुसार जाँचेंगे।';

  @override
  String get done => 'हो गया';

  @override
  String get timeNow => 'अभी';

  @override
  String timeMinutes(int n) {
    return '$n मि.';
  }

  @override
  String timeHours(int n) {
    return '$n घं.';
  }

  @override
  String timeDays(int n) {
    return '$n दिन';
  }

  @override
  String timeWeeks(int n) {
    return '$n सप्ताह';
  }

  @override
  String get storyReplyHint => 'संदेश भेजें…';

  @override
  String get storyClose => 'स्टोरी बंद करें';

  @override
  String get storyDemoReaction => 'प्रतिक्रिया भेजी गई';

  @override
  String get promoteTitle => 'अपनी पोस्ट प्रमोट करें';

  @override
  String get postScreenTitle => 'पोस्ट';

  @override
  String get exploreTitle => 'एक्सप्लोर';

  @override
  String get exploreSearchHint => 'लोग, जगहें और हैशटैग खोजें';

  @override
  String get exploreClearSearch => 'खोज साफ़ करें';

  @override
  String exploreLocationNote(String place) {
    return '$place दिखा रहे हैं। केवल ज़िला-स्तर, आपकी सटीक लोकेशन कभी नहीं।';
  }

  @override
  String exploreTrendingIn(String place) {
    return '$place में ट्रेंडिंग';
  }

  @override
  String exploreTrendPosts(String count) {
    return '$count पोस्ट';
  }

  @override
  String get exploreCategories => 'श्रेणियाँ';

  @override
  String get exploreAll => 'सभी';

  @override
  String get placeWorld => 'दुनिया';

  @override
  String exploreNoResults(String query) {
    return '“$query” के लिए कोई परिणाम नहीं';
  }

  @override
  String get exploreNoResultsBody => 'कोई दूसरा नाम, जगह या हैशटैग आज़माएँ।';

  @override
  String get exploreResultsPeople => 'लोग';

  @override
  String get exploreResultsHashtags => 'हैशटैग';

  @override
  String get exploreResultsPosts => 'पोस्ट';

  @override
  String get catNews => 'समाचार';

  @override
  String get catEntertainment => 'मनोरंजन';

  @override
  String get catEducation => 'शिक्षा';

  @override
  String get catBusiness => 'व्यापार';

  @override
  String get catFood => 'खान-पान';

  @override
  String get catTravel => 'यात्रा';

  @override
  String get catTechnology => 'तकनीक';

  @override
  String get catSports => 'खेल';

  @override
  String get catAgriculture => 'कृषि';

  @override
  String get catFashion => 'फ़ैशन';

  @override
  String get catLocal => 'स्थानीय';

  @override
  String get catJobs => 'नौकरियाँ';

  @override
  String get catEvents => 'आयोजन';

  @override
  String get reelMute => 'म्यूट';

  @override
  String get reelUnmute => 'अनम्यूट';

  @override
  String get reelPlay => 'चलाएँ';

  @override
  String get reelPause => 'रोकें';

  @override
  String reelMusic(String title) {
    return 'संगीत: $title';
  }

  @override
  String get reelCreate => 'रील बनाएँ';

  @override
  String get actionFollow => 'फ़ॉलो करें';

  @override
  String get actionFollowing => 'फ़ॉलो कर रहे हैं';

  @override
  String get actionMessage => 'संदेश';

  @override
  String get createTitle => 'बनाएँ';

  @override
  String get createOptionPost => 'पोस्ट';

  @override
  String get createOptionPostBody => 'फ़ोटो या टेक्स्ट अपडेट साझा करें';

  @override
  String get createOptionReel => 'रील';

  @override
  String get createOptionReelBody => 'छोटा वर्टिकल वीडियो';

  @override
  String get createOptionStory => 'स्टोरी';

  @override
  String get createOptionStoryBody => '24 घंटे बाद गायब हो जाती है';

  @override
  String get createOptionLive => 'लाइव जाएँ';

  @override
  String get createOptionLiveBody => 'योग्य क्रिएटर्स के लिए';

  @override
  String get createPostTitle => 'नई पोस्ट';

  @override
  String get createReelTitle => 'नई रील';

  @override
  String get createStoryTitle => 'नई स्टोरी';

  @override
  String get createTypePhoto => 'फ़ोटो';

  @override
  String get createTypeText => 'टेक्स्ट';

  @override
  String get createPickPhoto => 'फ़ोटो चुनें';

  @override
  String get createPickVideo => 'वीडियो चुनें';

  @override
  String get createGalleryNote =>
      'डेमो गैलरी — असली ऐप में यह आपके डिवाइस की गैलरी खोलेगा।';

  @override
  String get createCaptionLabel => 'कैप्शन';

  @override
  String get createCaptionHint => 'आपके ब्लॉक में क्या चल रहा है?';

  @override
  String get createHashtags => 'सुझाए गए हैशटैग';

  @override
  String get createLocation => 'लोकेशन';

  @override
  String get createLocationNote =>
      'केवल ज़िला-स्तर। आपकी सटीक लोकेशन कभी साझा नहीं होती।';

  @override
  String get createChangeLocation => 'बदलें';

  @override
  String get createSearchDistrict => 'ज़िले खोजें';

  @override
  String get createAudience => 'दर्शक';

  @override
  String get audienceEveryone => 'सभी';

  @override
  String get audienceFollowers => 'फ़ॉलोअर्स';

  @override
  String get audienceCloseFriends => 'क़रीबी दोस्त';

  @override
  String get createPublish => 'पोस्ट';

  @override
  String get createPublishing => 'पोस्ट हो रहा है…';

  @override
  String createPosted(String district) {
    return 'आपकी पोस्ट $district में लाइव है';
  }

  @override
  String get createReelPosted => 'आपकी रील लाइव है';

  @override
  String get createStoryPosted => 'आपकी स्टोरी में जोड़ा गया';

  @override
  String get createErrorCaptionTooLong =>
      'कैप्शन बहुत लंबा है (अधिकतम 2,200 अक्षर)';

  @override
  String get createErrorCaptionRequired => 'साझा करने के लिए कुछ लिखें';

  @override
  String get createErrorMediaRequired => 'पहले फ़ोटो या वीडियो चुनें';

  @override
  String get createErrorTooManyHashtags => 'बहुत ज़्यादा हैशटैग (अधिकतम 30)';

  @override
  String get createErrorLocationRequired => 'लोकेशन चुनें';

  @override
  String createStartsAt(String level, String district) {
    return '$level से शुरू · $district';
  }

  @override
  String get createStartsBody =>
      'जब अलग-अलग ज़िलों के लोग जुड़ते हैं तो यह पहुँच की सीढ़ी चढ़ती है।';

  @override
  String get createMusic => 'संगीत';

  @override
  String get createChooseMusic => 'संगीत चुनें';

  @override
  String get createCover => 'कवर';

  @override
  String get createStoryText => 'अपनी स्टोरी में टेक्स्ट जोड़ें';

  @override
  String get createStoryShare => 'स्टोरी में साझा करें';

  @override
  String get createStoryTextHint => 'कुछ कहें…';

  @override
  String get liveTitle => 'लाइव जाएँ';

  @override
  String get liveAccessTitle => 'लाइव एक्सेस';

  @override
  String liveFollowersRule(int required) {
    final intl.NumberFormat requiredNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String requiredString = requiredNumberFormat.format(required);

    return 'फ़ॉलोअर्स: $requiredString ज़रूरी';
  }

  @override
  String liveFollowersYours(int current) {
    final intl.NumberFormat currentNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String currentString = currentNumberFormat.format(current);

    return 'आपके फ़ॉलोअर्स: $currentString';
  }

  @override
  String liveAgeRule(int required) {
    final intl.NumberFormat requiredNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String requiredString = requiredNumberFormat.format(required);

    return 'खाते की उम्र: $requiredString दिन ज़रूरी';
  }

  @override
  String liveAgeYours(int current) {
    final intl.NumberFormat currentNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String currentString = currentNumberFormat.format(current);

    return 'आपका खाता: $currentString दिन';
  }

  @override
  String get liveTrustRule => 'भरोसा स्थिति';

  @override
  String get liveTrustEligible => 'योग्य';

  @override
  String get liveTrustReview => 'समीक्षा में';

  @override
  String get liveTrustRestricted => 'प्रतिबंधित';

  @override
  String get liveTwoFactorRule => 'टू-फ़ैक्टर ऑथेंटिकेशन';

  @override
  String get liveEnabled => 'चालू';

  @override
  String get liveNotEnabled => 'चालू नहीं';

  @override
  String get liveViolationRule => 'कोई बड़ा उल्लंघन नहीं';

  @override
  String get liveAgeRuleEligible => 'आयु पात्रता';

  @override
  String get liveMet => 'पूरा';

  @override
  String get liveNotMet => 'पूरा नहीं';

  @override
  String get liveGranted => 'लाइव एक्सेस मिल गया';

  @override
  String get liveGrantedBody =>
      'आप सभी शर्तें पूरी करते हैं। इस डेमो में लाइव स्ट्रीमिंग उपलब्ध नहीं है।';

  @override
  String get liveNotYet => 'अभी योग्य नहीं';

  @override
  String get liveNotYetBody => 'लाइव खोलने के लिए नीचे की शर्तें पूरी करें।';

  @override
  String get liveEnableTwoFactor => 'टू-फ़ैक्टर ऑथेंटिकेशन चालू करें';

  @override
  String get liveStart => 'लाइव शुरू करें';

  @override
  String get liveRequirementMet => 'शर्त पूरी';

  @override
  String get liveRequirementNotMet => 'शर्त पूरी नहीं';

  @override
  String get profilePosts => 'पोस्ट';

  @override
  String get profileFollowers => 'फ़ॉलोअर्स';

  @override
  String get profileFollowing => 'फ़ॉलोइंग';

  @override
  String get profileTabPosts => 'पोस्ट';

  @override
  String get profileTabReels => 'रील्स';

  @override
  String get profileTabTagged => 'टैग किए गए';

  @override
  String get profileReachLevel => 'पहुँच स्तर';

  @override
  String profileLevelLine(String code, String level) {
    return '$code — $level';
  }

  @override
  String get profileShare => 'साझा करें';

  @override
  String get profileMenu => 'मेनू';

  @override
  String get profileCreatorStudio => 'क्रिएटर स्टूडियो';

  @override
  String get profileBusiness => 'बिज़नेस प्रोफ़ाइल';

  @override
  String get profileVerification => 'वेरिफ़िकेशन';

  @override
  String get profileSafetyCenter => 'सेफ़्टी सेंटर';

  @override
  String get profileSettings => 'सेटिंग्स';

  @override
  String get profileMessages => 'संदेश';

  @override
  String get profileBestPost => 'आपकी सबसे अच्छी पोस्ट के आधार पर';

  @override
  String get verifiedIdentity => 'सत्यापित पहचान';

  @override
  String get verifiedBusiness => 'सत्यापित बिज़नेस';

  @override
  String get verifiedCreator => 'सत्यापित क्रिएटर';

  @override
  String get verifiedPublisher => 'सत्यापित प्रकाशक';

  @override
  String get backTooltip => 'वापस';

  @override
  String get studioTitle => 'क्रिएटर स्टूडियो';

  @override
  String get studioSubtitle => 'पहुँच, ग्रोथ और कमाई एक नज़र में';

  @override
  String get studioEstimatedEarnings => 'अनुमानित कमाई';

  @override
  String get studioEarningsNote =>
      'अनुमान योग्य पहुँच से बनते हैं और गुणवत्ता जाँच के बाद बदल सकते हैं। ये डेमो मान हैं, भुगतान का वादा नहीं।';

  @override
  String get studioFollowers => 'फ़ॉलोअर्स';

  @override
  String get studioQualifiedReach => 'योग्य पहुँच';

  @override
  String get studioLast30 => 'पिछले 30 दिन';

  @override
  String studioLevelReach(String level) {
    return '$level पहुँच';
  }

  @override
  String get studioReachPerformance => 'पहुँच का प्रदर्शन';

  @override
  String get studioReachPerformanceBody =>
      'हर स्तर आपके दर्शकों के कितने हिस्से तक पहुँचा।';

  @override
  String get studioNextMilestone => 'अगला पड़ाव';

  @override
  String studioMilestoneProgress(int percent) {
    return '$percent% पूरा';
  }

  @override
  String get studioMilestoneBody =>
      'अलग-अलग राज्यों में अपने दर्शक बढ़ाते रहें।';

  @override
  String get studioMilestoneTop =>
      'आप सीढ़ी के शीर्ष पर हैं। रफ़्तार बनाए रखें।';

  @override
  String get studioTopPosts => 'सबसे अच्छी पोस्ट';

  @override
  String get studioOpenPost => 'पोस्ट खोलें';

  @override
  String get businessLabel => 'BLOCKS बिज़नेस';

  @override
  String get businessTabPosts => 'पोस्ट';

  @override
  String get businessTabReels => 'रील्स';

  @override
  String get businessTabOffers => 'ऑफ़र';

  @override
  String get businessTabAbout => 'परिचय';

  @override
  String businessFollowers(String count) {
    return '$count फ़ॉलोअर्स';
  }

  @override
  String get businessContact => 'संपर्क';

  @override
  String get businessPromote => 'प्रमोट';

  @override
  String get businessCall => 'कॉल';

  @override
  String get businessWhatsApp => 'व्हाट्सऐप';

  @override
  String get businessWebsite => 'वेबसाइट';

  @override
  String businessCopied(String what) {
    return '$what कॉपी हो गया';
  }

  @override
  String get businessHours => 'खुलने का समय';

  @override
  String get businessCategory => 'श्रेणी';

  @override
  String get businessLocation => 'लोकेशन';

  @override
  String businessOfferCode(String code) {
    return 'कोड: $code';
  }

  @override
  String businessOfferValid(String date) {
    return '$date तक मान्य';
  }

  @override
  String get businessCopyCode => 'कोड कॉपी करें';

  @override
  String get businessAbout => 'परिचय';

  @override
  String promoteStepOf(int current, int total) {
    return 'चरण $current / $total';
  }

  @override
  String get promoteStepPost => 'पोस्ट चुनें';

  @override
  String get promoteStepGoal => 'लक्ष्य चुनें';

  @override
  String get promoteStepAudience => 'दर्शक चुनें';

  @override
  String get promoteStepLocation => 'लोकेशन चुनें';

  @override
  String get promoteStepBudget => 'बजट तय करें';

  @override
  String get promoteStepReview => 'समीक्षा';

  @override
  String get promoteStepPublish => 'प्रकाशित करें';

  @override
  String get goalFollowers => 'ज़्यादा फ़ॉलोअर्स';

  @override
  String get goalFollowersBody =>
      'फ़ॉलो करने की संभावना वाले लोगों से दर्शक बढ़ाएँ।';

  @override
  String get goalReach => 'ज़्यादा पहुँच';

  @override
  String get goalReachBody => 'अपनी पोस्ट ज़्यादा से ज़्यादा लोगों को दिखाएँ।';

  @override
  String get goalWebsite => 'वेबसाइट विज़िट';

  @override
  String get goalWebsiteBody => 'लोगों को अपनी वेबसाइट पर भेजें।';

  @override
  String get goalContact => 'व्हाट्सऐप / संपर्क';

  @override
  String get goalContactBody => 'कॉल और व्हाट्सऐप संदेश पाएँ।';

  @override
  String get goalVideoViews => 'वीडियो व्यूज़';

  @override
  String get goalVideoViewsBody => 'ज़्यादा लोग आपका वीडियो देखें।';

  @override
  String get promoteAudienceNote =>
      'हम रुचि समूहों को टारगेट करते हैं। निजी जानकारी विज्ञापनदाताओं से कभी साझा नहीं होती।';

  @override
  String get promoteInterests => 'रुचियाँ';

  @override
  String get promoteLocationsHint =>
      'आपकी पोस्ट कहाँ दिखे? एक या ज़्यादा ज़िले चुनें।';

  @override
  String get promoteAddDistrict => 'ज़िला जोड़ें';

  @override
  String get promoteDailyBudget => 'दैनिक बजट';

  @override
  String get promoteDuration => 'अवधि';

  @override
  String promoteDays(int n) {
    return '$n दिन';
  }

  @override
  String get promoteTotal => 'कुल बजट';

  @override
  String get promoteEstimatedReach => 'अनुमानित पहुँच';

  @override
  String promoteReachRange(String min, String max) {
    return '$min – $max लोग';
  }

  @override
  String get promoteDemoBanner => 'डेमो कैंपेन। कोई असली पैसा नहीं लगता।';

  @override
  String get promoteContinue => 'आगे बढ़ें';

  @override
  String get promoteBack => 'वापस';

  @override
  String get promotePublish => 'डेमो कैंपेन प्रकाशित करें';

  @override
  String get promoteSuccessTitle => 'डेमो कैंपेन बन गया';

  @override
  String get promoteSuccessBody =>
      'असली ऐप में आपकी पोस्ट अब नए लोगों तक पहुँचना शुरू कर देती। कोई पैसा नहीं काटा गया।';

  @override
  String get promoteDone => 'हो गया';

  @override
  String get promoteReviewPost => 'पोस्ट';

  @override
  String get promoteReviewGoal => 'लक्ष्य';

  @override
  String get promoteReviewAudience => 'दर्शक';

  @override
  String get promoteReviewLocation => 'लोकेशन';

  @override
  String get promoteReviewBudget => 'बजट';

  @override
  String get promoteNoPosts => 'पहले एक पोस्ट बनाएँ, फिर उसे प्रमोट करें।';

  @override
  String get campErrPost => 'प्रमोट करने के लिए पोस्ट चुनें';

  @override
  String get campErrGoal => 'लक्ष्य चुनें';

  @override
  String get campErrLocation => 'कम से कम एक लोकेशन चुनें';

  @override
  String get campErrBudgetLow => 'न्यूनतम दैनिक बजट ₹100 है';

  @override
  String get campErrBudgetHigh => 'अधिकतम दैनिक बजट ₹50,000 है';

  @override
  String get campErrDuration => 'अवधि 1 से 30 दिन होनी चाहिए';

  @override
  String get notifTitle => 'सूचनाएँ';

  @override
  String get notifMarkAllRead => 'सभी को पढ़ा हुआ मार्क करें';

  @override
  String get notifAllMarked => 'सभी सूचनाएँ पढ़ी हुई मार्क हो गईं';

  @override
  String get notifAll => 'सभी';

  @override
  String get notifCatLikes => 'पसंद';

  @override
  String get notifCatComments => 'टिप्पणियाँ';

  @override
  String get notifCatFollowers => 'नए फ़ॉलोअर्स';

  @override
  String get notifCatShares => 'शेयर';

  @override
  String get notifCatReach => 'पहुँच स्तर';

  @override
  String get notifCatEarnings => 'कमाई';

  @override
  String get notifCatBusiness => 'बिज़नेस';

  @override
  String get notifCatSafety => 'सुरक्षा';

  @override
  String get notifUnread => 'अपठित';

  @override
  String get notifEmptyTitle => 'आप सब देख चुके हैं';

  @override
  String get notifEmptyBody => 'नई गतिविधि यहाँ दिखेगी।';

  @override
  String get messagesTitle => 'संदेश';

  @override
  String get messagesSearchHint => 'बातचीत खोजें';

  @override
  String get messagesEmptyTitle => 'अभी कोई बातचीत नहीं';

  @override
  String get messagesEmptyBody => 'किसी की प्रोफ़ाइल से शुरू करें।';

  @override
  String messagesNoMatch(String query) {
    return '“$query” से कोई बातचीत नहीं मिली';
  }

  @override
  String get chatOnline => 'ऑनलाइन';

  @override
  String get chatOffline => 'ऑफ़लाइन';

  @override
  String get chatMessageHint => 'संदेश…';

  @override
  String get chatSend => 'भेजें';

  @override
  String get chatAttach => 'फ़ोटो जोड़ें';

  @override
  String get chatVoice => 'वॉइस संदेश रिकॉर्ड करें';

  @override
  String get chatPhoto => 'फ़ोटो';

  @override
  String chatVoiceMessage(String duration) {
    return 'वॉइस संदेश, $duration';
  }

  @override
  String get chatUnavailableDemo => 'इस डेमो में उपलब्ध नहीं';

  @override
  String get chatEmptyTitle => 'नमस्ते कहें';

  @override
  String get chatEmptyBody => 'आपके भेजे संदेश यहाँ दिखेंगे।';

  @override
  String conversationUnread(String count) {
    return '$count अपठित';
  }

  @override
  String get verifyTitle => 'वेरिफ़िकेशन';

  @override
  String get verifyStatusTitle => 'वेरिफ़िकेशन स्थिति';

  @override
  String get verifyStatusNone => 'सत्यापित नहीं';

  @override
  String get verifyStatusPending => 'समीक्षा में';

  @override
  String get verifyStatusVerified => 'सत्यापित';

  @override
  String get verifyStatusRejected => 'स्वीकृत नहीं';

  @override
  String get verifyIntro =>
      'बैज कमाए जाते हैं, ख़रीदे नहीं जाते। हर बैज के स्पष्ट नियम हैं और उसे वापस लिया जा सकता है।';

  @override
  String get verifyBodyIdentity =>
      'मान्य आईडी जाँच से पुष्टि करता है कि आप असली व्यक्ति हैं।';

  @override
  String get verifyBodyBusiness =>
      'पुष्टि करता है कि बिज़नेस या संस्था असली है।';

  @override
  String get verifyBodyCreator =>
      'लगातार मौलिक और नियमों का पालन करने वाले क्रिएटर्स को पहचान देता है।';

  @override
  String get verifyBodyPublisher =>
      'उन समाचार और मीडिया संस्थाओं के लिए जो स्रोत देती हैं और सुधार प्रकाशित करती हैं।';

  @override
  String get verifyRequest => 'अनुरोध करें';

  @override
  String get verifyRequested => 'अनुरोध भेजा';

  @override
  String get verifyCurrent => 'वर्तमान बैज';

  @override
  String get verifySubmitted => 'वेरिफ़िकेशन का अनुरोध भेजा गया';

  @override
  String get verifyDemoAdminTitle => 'डेमो एडमिन';

  @override
  String get verifyDemoAdminBody =>
      'असली ऐप में ट्रस्ट टीम आपके अनुरोध की समीक्षा करती है। इस डेमो में आप ख़ुद इसे मंज़ूर कर सकते हैं।';

  @override
  String get verifyApprove => 'मंज़ूर करें (डेमो)';

  @override
  String get verifyApproved => 'आप सत्यापित हो गए';

  @override
  String get safetyTitle => 'सेफ़्टी सेंटर';

  @override
  String get safetyIntro =>
      'यह तय करने के टूल कि कौन आप तक पहुँच सकता है और आप क्या देखते हैं।';

  @override
  String get safetySectionReport => 'रिपोर्ट';

  @override
  String get safetyReportContent => 'कंटेंट या समस्या रिपोर्ट करें';

  @override
  String get safetyReportContentBody =>
      'आप किसी भी पोस्ट, रील या प्रोफ़ाइल पर तीन बिंदु भी दबा सकते हैं।';

  @override
  String get safetySectionPeople => 'लोग';

  @override
  String get safetyBlocked => 'ब्लॉक किए गए खाते';

  @override
  String get safetyMuted => 'म्यूट किए गए खाते';

  @override
  String get safetyRestricted => 'सीमित खाते';

  @override
  String get safetyRestrictedBody =>
      'सीमित लोग यह नहीं देख पाते कि आप कब सक्रिय हैं। किसी को सीमित करने के लिए उनके प्रोफ़ाइल मेनू का उपयोग करें।';

  @override
  String get safetySectionControls => 'नियंत्रण';

  @override
  String get safetySensitive => 'संवेदनशील कंटेंट';

  @override
  String get safetySensitiveBody =>
      'तय करें कि आपकी फ़ीड में कितना संवेदनशील कंटेंट दिखे।';

  @override
  String get safetySensitiveLess => 'कम';

  @override
  String get safetySensitiveStandard => 'सामान्य';

  @override
  String get safetySensitiveMore => 'ज़्यादा';

  @override
  String get safetyComments => 'कौन टिप्पणी कर सकता है';

  @override
  String get safetyMessages => 'कौन आपको संदेश भेज सकता है';

  @override
  String get safetyEveryone => 'सभी';

  @override
  String get safetyFollowers => 'फ़ॉलोअर्स';

  @override
  String get safetyNobody => 'कोई नहीं';

  @override
  String get safetyPrivateAccount => 'निजी खाता';

  @override
  String get safetyPrivateAccountBody =>
      'केवल स्वीकृत फ़ॉलोअर्स आपकी पोस्ट देख सकते हैं।';

  @override
  String get safetySectionSecurity => 'सुरक्षा';

  @override
  String get safetyTwoFactor => 'टू-फ़ैक्टर ऑथेंटिकेशन';

  @override
  String get safetyTwoFactorBody =>
      'साइन इन करते समय दूसरा चरण जोड़ता है। लाइव के लिए ज़रूरी।';

  @override
  String get safetyLoginSecurity => 'लॉगिन सुरक्षा';

  @override
  String safetyLoginBody(String place) {
    return 'यह डिवाइस · $place · अभी सक्रिय';
  }

  @override
  String get safetyLoginAlerts => 'नए साइन-इन पर मुझे सूचित करें';

  @override
  String get blockedTitle => 'ब्लॉक किए गए खाते';

  @override
  String get mutedTitle => 'म्यूट किए गए खाते';

  @override
  String get blockedEmptyBody =>
      'जिन्हें आप ब्लॉक करते हैं वे आपकी प्रोफ़ाइल नहीं ढूँढ पाते।';

  @override
  String get mutedEmptyBody =>
      'म्यूट किए लोगों की पोस्ट आपकी फ़ीड से छिपी रहती हैं।';

  @override
  String get unblock => 'अनब्लॉक करें';

  @override
  String get unmute => 'अनम्यूट करें';

  @override
  String unblockedToast(String username) {
    return '$username अनब्लॉक किया गया';
  }

  @override
  String unmutedToast(String username) {
    return '$username अनम्यूट किया गया';
  }

  @override
  String get settingsTitle => 'सेटिंग्स';

  @override
  String get settingsSectionAccount => 'खाता';

  @override
  String get settingsSectionPreferences => 'पसंद';

  @override
  String get settingsSectionSupport => 'सहायता';

  @override
  String get settingsAppearance => 'दिखावट';

  @override
  String get themeSystem => 'सिस्टम';

  @override
  String get themeLight => 'लाइट';

  @override
  String get themeDark => 'डार्क';

  @override
  String get settingsAccount => 'खाते का विवरण';

  @override
  String get settingsPrivacy => 'गोपनीयता';

  @override
  String get settingsSecurity => 'सुरक्षा';

  @override
  String get settingsNotifications => 'सूचनाएँ';

  @override
  String get settingsLanguage => 'भाषा';

  @override
  String get settingsLanguageSystem => 'सिस्टम डिफ़ॉल्ट';

  @override
  String get settingsContent => 'कंटेंट पसंद';

  @override
  String get settingsCreator => 'क्रिएटर सेटिंग्स';

  @override
  String get settingsBusiness => 'बिज़नेस सेटिंग्स';

  @override
  String get settingsHelp => 'मदद और सहायता';

  @override
  String get settingsGuidelines => 'कम्युनिटी गाइडलाइन्स';

  @override
  String get settingsPrivacyPolicy => 'गोपनीयता नीति';

  @override
  String get settingsTerms => 'सेवा की शर्तें';

  @override
  String get settingsLogout => 'लॉग आउट';

  @override
  String get settingsLogoutTitle => 'BLOCKS से लॉग आउट करें?';

  @override
  String get settingsLogoutBody =>
      'आप कभी भी डेमो यूज़र के रूप में फिर साइन इन कर सकते हैं।';

  @override
  String get settingsDemoMode => 'डेमो मोड · सारा डेटा इसी डिवाइस पर बनता है';

  @override
  String get settingsAccountName => 'नाम';

  @override
  String get settingsAccountUsername => 'यूज़रनेम';

  @override
  String get settingsAccountLocation => 'लोकेशन';

  @override
  String get settingsAccountAge => 'BLOCKS पर समय';

  @override
  String settingsAccountDays(String days) {
    return '$days दिन';
  }

  @override
  String get prefNotifLikes => 'पसंद';

  @override
  String get prefNotifComments => 'टिप्पणियाँ';

  @override
  String get prefNotifFollowers => 'नए फ़ॉलोअर्स';

  @override
  String get prefNotifReach => 'पहुँच स्तर अनलॉक';

  @override
  String get prefNotifEarnings => 'क्रिएटर कमाई';

  @override
  String get prefNotifBusiness => 'बिज़नेस गतिविधि';

  @override
  String get prefNotifSafety => 'सुरक्षा और संरक्षा';

  @override
  String get prefAlwaysOn => 'हमेशा चालू';

  @override
  String get prefAutoplay => 'वीडियो ऑटोप्ले';

  @override
  String get prefDataSaver => 'डेटा सेवर';

  @override
  String get prefDataSaverBody =>
      'छोटी इमेज लोड करता है और प्रीलोडिंग सीमित करता है।';

  @override
  String get prefShowReachBadge => 'मेरी प्रोफ़ाइल पर पहुँच स्तर दिखाएँ';

  @override
  String get prefCreatorEarnings => 'क्रिएटर स्टूडियो में कमाई दिखाएँ';

  @override
  String get prefWeeklySummary => 'साप्ताहिक प्रदर्शन सारांश';

  @override
  String get prefBusinessAutoReply => 'संदेशों का ऑटो-रिप्लाई';

  @override
  String get prefBusinessContact => 'संपर्क बटन दिखाएँ';

  @override
  String get prefOpenBusiness => 'बिज़नेस प्रोफ़ाइल खोलें';

  @override
  String get infoGuidelinesTitle => 'कम्युनिटी गाइडलाइन्स';

  @override
  String get infoGuidelinesBody =>
      '# असली बनें\nअपना काम साझा करें और बताएँ जब कंटेंट AI से बना हो या किसी स्रोत से लिया गया हो।\n\n# दयालु बनें\nउत्पीड़न, नफ़रत या धमकी नहीं। लोगों पर हमला किए बिना असहमत हों।\n\n# सुरक्षित रखें\nयौन शोषण, ग्राफ़िक हिंसा, स्वयं को नुकसान को बढ़ावा, धोखाधड़ी या अवैध सामान नहीं। नाबालिगों से जुड़ा कंटेंट तुरंत हटा दिया जाता है।\n\n# पहुँच ईमानदारी से कमाएँ\nनकली एंगेजमेंट, बॉट और व्यू में हेराफेरी की अनुमति नहीं। पहुँच स्तर केवल योग्य दर्शकों को गिनते हैं।\n\n# अपील\nअगर हम कुछ हटाते हैं तो आप अपील कर सकते हैं और कोई व्यक्ति उसकी समीक्षा करेगा।';

  @override
  String get infoPrivacyTitle => 'गोपनीयता नीति';

  @override
  String get infoPrivacyBody =>
      '# हम क्या इकट्ठा करते हैं\nकेवल वही जो BLOCKS को चाहिए: आपकी प्रोफ़ाइल, पोस्ट और ज़िला। आपकी सटीक GPS लोकेशन कभी नहीं।\n\n# हम क्या कभी नहीं करते\nहम आपका निजी डेटा नहीं बेचते। विज्ञापनदाता रुचि समूहों तक पहुँचते हैं, व्यक्तियों तक नहीं।\n\n# आपके नियंत्रण\nगोपनीयता, संदेश और सूचनाएँ नियंत्रित करने के लिए सेफ़्टी सेंटर और सेटिंग्स का उपयोग करें। आप अपना डेटा माँग सकते हैं या खाता हटा सकते हैं।\n\n# भुगतान और पहचान\nभुगतान और पहचान का विवरण आपकी सार्वजनिक प्रोफ़ाइल से अलग रखा जाता है।\n\n# डेमो नोट\nयह प्रोटोटाइप के लिए सारांश है, कानूनी नीति नहीं।';

  @override
  String get infoTermsTitle => 'सेवा की शर्तें';

  @override
  String get infoTermsBody =>
      '# BLOCKS का उपयोग\nआपकी उम्र आपके देश में सोशल मीडिया इस्तेमाल करने लायक होनी चाहिए और आपको कम्युनिटी गाइडलाइन्स माननी होंगी।\n\n# आपका कंटेंट\nआप जो पोस्ट करते हैं उसके मालिक आप हैं और BLOCKS को उसे दूसरों को दिखाने की अनुमति देते हैं।\n\n# क्रिएटर रिवॉर्ड\nरिवॉर्ड योग्य पहुँच के आधार पर साझा पूल से आते हैं। अंतिम होने तक वे अनुमान हैं और प्रति व्यू रुपये का वादा नहीं हैं।\n\n# डेमो नोट\nयह प्रोटोटाइप के लिए सारांश है, कानूनी शर्तें नहीं।';

  @override
  String get infoHelpTitle => 'मदद और सहायता';

  @override
  String get infoHelpBody =>
      '# पहुँच स्तर कैसे काम करते हैं?\nजब ज़्यादा जगहों के असली लोग जुड़ते हैं तो पोस्ट ज़िला, राज्य, राष्ट्रीय और वैश्विक स्तर चढ़ती है।\n\n# मेरी पोस्ट अभी भी ज़िला स्तर पर क्यों है?\nकेवल योग्य व्यूज़ गिने जाते हैं। यह कितनी पास है, देखने के लिए उभरते टैब खोलें।\n\n# वेरिफ़ाई कैसे हों?\nप्रोफ़ाइल, फिर मेनू, फिर वेरिफ़िकेशन खोलें और बैज का अनुरोध करें।\n\n# कुछ रिपोर्ट कैसे करूँ?\nपोस्ट, रील या प्रोफ़ाइल पर तीन बिंदु दबाएँ और रिपोर्ट चुनें।\n\n# किसी व्यक्ति से बात करनी है?\nयह डेमो है, इसलिए लाइव सहायता नहीं है।';

  @override
  String get reelsTabForYou => 'आपके लिए';

  @override
  String get reelsTabFollowing => 'फ़ॉलोइंग';

  @override
  String get reelsFollowingEmptyTitle =>
      'जिन्हें आप फ़ॉलो करते हैं उनकी कोई रील अभी नहीं है';

  @override
  String get reelsFollowingEmptyBody =>
      'रील देखने के लिए क्रिएटर्स को फ़ॉलो करें।';

  @override
  String get reelsFeedSemantics => 'रील फ़ीड';

  @override
  String get prefReelsSound => 'रील की आवाज़';

  @override
  String get prefReelsSoundBody =>
      'नए सत्र में रील हमेशा म्यूट से शुरू होती हैं।';

  @override
  String get secAlertEmail => 'ईमेल से सुरक्षा अलर्ट';

  @override
  String get secAlertPush => 'मेरे डिवाइस पर सुरक्षा अलर्ट';

  @override
  String get secAlertNewDevice => 'नए डिवाइस से साइन-इन अलर्ट';

  @override
  String get notifCatSecurity => 'सुरक्षा';

  @override
  String get secTitle => 'सुरक्षा';

  @override
  String get secStatusProtected => 'आपका खाता सुरक्षित है';

  @override
  String get secStatusAttention => 'आपके खाते पर ध्यान देने की ज़रूरत है';

  @override
  String get secStatusBody2faOn =>
      'टू-फ़ैक्टर ऑथेंटिकेशन चालू है और कुछ भी असामान्य नहीं मिला।';

  @override
  String get secStatusBody2faOff =>
      'अपने खाते की सुरक्षा के लिए टू-फ़ैक्टर ऑथेंटिकेशन चालू करें।';

  @override
  String get secStatusBodySuspicious =>
      'हमें एक संदिग्ध साइन-इन मिला है। इसे अभी देखें।';

  @override
  String secLastSignIn(String when) {
    return 'पिछला साइन-इन: $when';
  }

  @override
  String get secSectionAccount => 'खाते की सुरक्षा';

  @override
  String get secSectionDemo => 'डेमो';

  @override
  String get secChangePassword => 'पासवर्ड बदलें';

  @override
  String get secChangeEmail => 'ईमेल बदलें';

  @override
  String get secChangePhone => 'फ़ोन नंबर बदलें';

  @override
  String get secTwoFactor => 'टू-फ़ैक्टर ऑथेंटिकेशन';

  @override
  String get secLoginActivity => 'लॉगिन गतिविधि';

  @override
  String get secDevices => 'लॉग-इन किए हुए डिवाइस';

  @override
  String get secLogoutOthers => 'सभी अन्य डिवाइस से लॉग आउट करें';

  @override
  String get secNotifications => 'सुरक्षा सूचनाएँ';

  @override
  String get secOn => 'चालू';

  @override
  String get secOff => 'बंद';

  @override
  String secDevicesCount(int n) {
    return '$n डिवाइस';
  }

  @override
  String get secLogoutOthersTitle => 'सभी अन्य डिवाइस से लॉग आउट करें?';

  @override
  String get secLogoutOthersBody =>
      'इससे इस डिवाइस को छोड़कर हर डिवाइस पर BLOCKS सत्र समाप्त हो जाएँगे।';

  @override
  String get secLogoutOthersConfirm => 'दूसरों को लॉग आउट करें';

  @override
  String get secLogoutOthersDone => 'सभी अन्य डिवाइस से लॉग आउट हो गया';

  @override
  String get secDemoLab => 'सुरक्षा डेमो लैब';

  @override
  String get secDemoLabBody =>
      'साइन-इन हमले, अलर्ट और डिवाइस बदलाव का अनुकरण करें।';

  @override
  String get secReviewNeeded => 'देखें';

  @override
  String get secFieldRequired => 'यह फ़ील्ड ज़रूरी है';

  @override
  String get secPasswordLabel => 'पासवर्ड';

  @override
  String get cpTitle => 'पासवर्ड बदलें';

  @override
  String get cpIntro =>
      'ऐसा मज़बूत पासवर्ड चुनें जो आप कहीं और इस्तेमाल नहीं करते।';

  @override
  String get cpCurrent => 'मौजूदा पासवर्ड';

  @override
  String get cpNew => 'नया पासवर्ड';

  @override
  String get cpConfirm => 'नए पासवर्ड की पुष्टि करें';

  @override
  String get cpShow => 'पासवर्ड दिखाएँ';

  @override
  String get cpHide => 'पासवर्ड छिपाएँ';

  @override
  String get cpStrength => 'पासवर्ड की मज़बूती';

  @override
  String get cpStrengthWeak => 'कमज़ोर';

  @override
  String get cpStrengthFair => 'ठीक-ठाक';

  @override
  String get cpStrengthStrong => 'मज़बूत';

  @override
  String get cpStrengthVeryStrong => 'बहुत मज़बूत';

  @override
  String cpRuleMinLength(int n) {
    return 'कम से कम $n अक्षर';
  }

  @override
  String get cpRuleUpper => 'एक बड़ा अक्षर (A-Z)';

  @override
  String get cpRuleLower => 'एक छोटा अक्षर (a-z)';

  @override
  String get cpRuleDigit => 'एक अंक (0-9)';

  @override
  String get cpRuleSpecial => 'एक विशेष चिह्न (! @ # ...)';

  @override
  String get cpMismatch => 'पासवर्ड मेल नहीं खाते';

  @override
  String get cpSubmit => 'पासवर्ड बदलें';

  @override
  String get cpForgot => 'मौजूदा पासवर्ड भूल गए?';

  @override
  String get cpSuccessTitle => 'पासवर्ड बदल गया';

  @override
  String get cpSuccessBody =>
      'आपका BLOCKS पासवर्ड सफलतापूर्वक अपडेट हो गया है।';

  @override
  String get cpErrorTitle => 'पासवर्ड नहीं बदला जा सका।';

  @override
  String get cpErrorBody =>
      'कृपया अपना मौजूदा पासवर्ड जाँचें और फिर कोशिश करें।';

  @override
  String get cpErrWeak => 'नया पासवर्ड ज़रूरी शर्तें पूरी नहीं करता।';

  @override
  String get cpErrSame => 'नया पासवर्ड मौजूदा पासवर्ड से अलग होना चाहिए।';

  @override
  String get devTitle => 'आपके डिवाइस';

  @override
  String get devActiveNow => 'अभी सक्रिय';

  @override
  String get devCurrentBadge => 'यह डिवाइस';

  @override
  String get devLogOut => 'लॉग आउट';

  @override
  String get devLogOutTitle => 'इस डिवाइस से लॉग आउट करें?';

  @override
  String devLogOutBody(String device) {
    return '$device BLOCKS से साइन आउट हो जाएगा।';
  }

  @override
  String get devLoggedOut => 'डिवाइस लॉग आउट हो गया';

  @override
  String get devEmpty => 'कोई और डिवाइस साइन-इन नहीं है।';

  @override
  String devOnPlatform(String app, String platform) {
    return '$platform पर $app';
  }

  @override
  String get actTitle => 'लॉगिन गतिविधि';

  @override
  String get actFilterAll => 'सभी';

  @override
  String get actFilterSuccessful => 'सफल';

  @override
  String get actFilterFailed => 'असफल';

  @override
  String get actFilterSuspicious => 'संदिग्ध';

  @override
  String get actToday => 'आज';

  @override
  String get actYesterday => 'कल';

  @override
  String get actEmptyTitle => 'दिखाने के लिए कोई गतिविधि नहीं';

  @override
  String get actEmptyBody => 'इस फ़िल्टर से कुछ मेल नहीं खाता।';

  @override
  String get evLoginSuccess => 'सफल लॉगिन';

  @override
  String get evLoginFailed => 'असफल लॉगिन प्रयास';

  @override
  String get evSuspicious => 'संदिग्ध लॉगिन प्रयास';

  @override
  String get evPasswordChanged => 'पासवर्ड बदला गया';

  @override
  String get evEmailChanged => 'ईमेल बदला गया';

  @override
  String get evPhoneChanged => 'फ़ोन नंबर बदला गया';

  @override
  String get evTwoFactorOn => 'टू-फ़ैक्टर ऑथेंटिकेशन चालू किया गया';

  @override
  String get evTwoFactorOff => 'टू-फ़ैक्टर ऑथेंटिकेशन बंद किया गया';

  @override
  String get evSessionRevoked => 'डिवाइस लॉग आउट किया गया';

  @override
  String evAttempts(int n) {
    return '$n असफल प्रयास';
  }

  @override
  String get evReviewed => 'देखा जा चुका';

  @override
  String get tfTitle => 'टू-फ़ैक्टर ऑथेंटिकेशन';

  @override
  String get tfIntro =>
      'साइन-इन करते समय एक दूसरा चरण जोड़ें, ताकि चोरी हुआ पासवर्ड काफ़ी न हो।';

  @override
  String get tfStatusOn => 'टू-फ़ैक्टर ऑथेंटिकेशन चालू है';

  @override
  String get tfStatusOff => 'टू-फ़ैक्टर ऑथेंटिकेशन बंद है';

  @override
  String get tfMethod => 'सत्यापन का तरीका';

  @override
  String get tfSms => 'टेक्स्ट संदेश (SMS)';

  @override
  String tfSmsBody(String phone) {
    return 'कोड $phone पर भेजे जाते हैं';
  }

  @override
  String get tfAuthenticator => 'ऑथेंटिकेटर ऐप';

  @override
  String get tfAuthenticatorBody =>
      'Google Authenticator या Authy जैसे ऐप का उपयोग करें।';

  @override
  String get tfEmailFallback => 'ईमेल विकल्प';

  @override
  String get tfEmailFallbackBody =>
      'अगर आपको कोड न मिले, तो हम आपके ईमेल पर भेज सकते हैं।';

  @override
  String get tfEnable => 'चालू करें';

  @override
  String get tfDisable => 'बंद करें';

  @override
  String get tfChooseMethod => 'कोड पाने का तरीका चुनें';

  @override
  String tfCodeSentTo(String dest) {
    return 'हमने $dest पर एक कोड भेजा है।';
  }

  @override
  String get tfAuthSetup =>
      'अपना ऑथेंटिकेटर ऐप खोलें और BLOCKS के लिए दिख रहा कोड दर्ज करें।';

  @override
  String get tfVerify => 'सत्यापित करें और चालू करें';

  @override
  String get tfEnabledToast => 'टू-फ़ैक्टर ऑथेंटिकेशन चालू है';

  @override
  String get tfDisableTitle => 'टू-फ़ैक्टर ऑथेंटिकेशन बंद करें?';

  @override
  String get tfDisableBody =>
      'आपका खाता केवल आपके पासवर्ड से सुरक्षित रहेगा। पुष्टि के लिए पासवर्ड दर्ज करें।';

  @override
  String get tfDisabledToast => 'टू-फ़ैक्टर ऑथेंटिकेशन बंद है';

  @override
  String get tfDemoNote =>
      'डेमो: असली SMS या ऑथेंटिकेटर ऐप का उपयोग नहीं होता।';

  @override
  String get otpEnterCode => 'सत्यापन कोड';

  @override
  String otpLabel(int n) {
    return '$n अंकों का कोड';
  }

  @override
  String otpDemoHint(String code) {
    return 'डेमो OTP: $code';
  }

  @override
  String get otpDemoNotice =>
      'केवल डेमो के लिए। असली ऐप कोड कभी स्क्रीन पर नहीं दिखाता।';

  @override
  String get otpResend => 'कोड फिर भेजें';

  @override
  String otpResendIn(int seconds) {
    return '$seconds सेकंड में फिर भेजें';
  }

  @override
  String get otpResent => 'नया कोड भेज दिया गया';

  @override
  String otpIncorrect(int attempts) {
    return 'यह कोड सही नहीं है। $attempts प्रयास बचे हैं।';
  }

  @override
  String get otpExpired => 'इस कोड की समय-सीमा खत्म हो गई। नया कोड मँगवाएँ।';

  @override
  String otpLocked(String time) {
    return 'बहुत ज़्यादा गलत कोड। $time के बाद फिर कोशिश करें।';
  }

  @override
  String get snTitle => 'सुरक्षा सूचनाएँ';

  @override
  String get snIntro =>
      'चुनें कि BLOCKS खाते की गतिविधि के बारे में आपको कैसे अलर्ट करे।';

  @override
  String get snCritical => 'संदिग्ध साइन-इन और खाते में बदलाव';

  @override
  String get snCriticalBody =>
      'हमेशा चालू। साइन-इन संदिग्ध लगने या पासवर्ड, ईमेल या फ़ोन बदलने पर हम हमेशा आपको अलर्ट करते हैं।';

  @override
  String get snSentTitle => 'आपके ईमेल पर भेजे गए अलर्ट';

  @override
  String get snSentEmpty => 'अभी तक कोई सुरक्षा ईमेल नहीं भेजा गया।';

  @override
  String snSentTo(String email) {
    return '$email पर भेजा गया';
  }

  @override
  String get snDemoNote => 'डेमो: ईमेल अनुकरण हैं और केवल यहीं सूचीबद्ध हैं।';

  @override
  String get alertSuspiciousTitle => 'संदिग्ध लॉगिन प्रयास';

  @override
  String get alertSuspiciousBody =>
      'हमने आपके BLOCKS खाते पर कई असफल लॉगिन प्रयास पाए हैं।';

  @override
  String get alertNewDeviceTitle => 'नए डिवाइस से साइन-इन';

  @override
  String get alertNewDeviceBody =>
      'एक नए डिवाइस ने आपके BLOCKS खाते में साइन-इन किया।';

  @override
  String get alertDevice => 'डिवाइस';

  @override
  String get alertLocation => 'अनुमानित स्थान';

  @override
  String get alertTime => 'समय';

  @override
  String get alertIfYou => 'अगर यह आप थे';

  @override
  String get alertIfYouBody => 'आपको कुछ करने की ज़रूरत नहीं है।';

  @override
  String get alertIfNotYou => 'अगर यह आप नहीं थे';

  @override
  String get alertIfNotYouBody =>
      'अपना पासवर्ड बदलें और लॉग-इन किए डिवाइस देखें।';

  @override
  String get alertSecure => 'खाता सुरक्षित करें';

  @override
  String get alertReview => 'डिवाइस देखें';

  @override
  String get alertWasMe => 'यह मैं था';

  @override
  String get alertAcknowledged => 'धन्यवाद। हमने इसे आपका मान लिया है।';

  @override
  String get alertSent => 'सुरक्षा अलर्ट भेजा गया';

  @override
  String get alertSentBody =>
      'हमने आपके पंजीकृत ईमेल और सक्रिय BLOCKS डिवाइस पर सुरक्षा सूचना भेजी है।';

  @override
  String get alertPrivacyNote =>
      'आपकी गोपनीयता के लिए हम केवल अनुमानित स्थान दिखाते हैं।';

  @override
  String get cpRuleMet => 'पूरी हुई';

  @override
  String get cpRuleNotMet => 'अभी पूरी नहीं हुई';

  @override
  String get otpDemoFill => 'कोड भरने के लिए टैप करें।';

  @override
  String get tfWrongPassword => 'यह पासवर्ड सही नहीं है।';

  @override
  String get authSignInPassword => 'पासवर्ड से साइन-इन करें';

  @override
  String get siTitle => 'वापसी पर स्वागत है';

  @override
  String get siSubtitle => 'अपने BLOCKS खाते में साइन-इन करें।';

  @override
  String get siIdentifier => 'ईमेल, फ़ोन या यूज़रनेम';

  @override
  String get siButton => 'साइन-इन करें';

  @override
  String get siForgot => 'पासवर्ड भूल गए?';

  @override
  String get siInvalid => 'ईमेल, फ़ोन या पासवर्ड गलत है।';

  @override
  String siAttemptsLeft(int n) {
    return 'आपका खाता अस्थायी रूप से सुरक्षित होने से पहले $n प्रयास बचे हैं।';
  }

  @override
  String get siProtectedTitle => 'खाता अस्थायी रूप से सुरक्षित किया गया';

  @override
  String siProtectedAttempts(int n) {
    return '$n असफल लॉगिन प्रयास पाए गए।';
  }

  @override
  String get siProtectedBody =>
      'आपके खाते को अस्थायी रूप से सुरक्षित कर दिया गया है।';

  @override
  String get siProtectedAdvice =>
      'अगर यह आप नहीं थे, तो अपना खाता तुरंत सुरक्षित करें।';

  @override
  String siProtectedUntil(String time) {
    return 'आप $time के बाद फिर कोशिश कर सकते हैं।';
  }

  @override
  String get siResetPassword => 'पासवर्ड रीसेट करें';

  @override
  String get siDemoCard => 'डेमो खाता';

  @override
  String siDemoPassword(String password) {
    return 'पासवर्ड: $password';
  }

  @override
  String get siDemoFill => 'डेमो साइन-इन भरने के लिए टैप करें।';

  @override
  String get labIntro =>
      'अलर्ट, सुरक्षा और डिवाइस बदलाव दिखाने के लिए डेमो सर्वर पर सुरक्षा परिदृश्य चलाएँ। असली ऐप में यह सब नहीं होता।';

  @override
  String get labStatus => 'सर्वर को क्या दिख रहा है';

  @override
  String labFailed(int n, int total) {
    return 'असफल साइन-इन: $n / $total';
  }

  @override
  String get labNotProtected => 'साइन-इन पर कोई रोक नहीं';

  @override
  String labProtectedUntil(String time) {
    return 'साइन-इन $time तक सुरक्षित है';
  }

  @override
  String labEmails(int n) {
    return 'भेजे गए सुरक्षा ईमेल: $n';
  }

  @override
  String labDevices(int n) {
    return 'सक्रिय डिवाइस: $n';
  }

  @override
  String get labPhotoArmed => 'अगला प्रोफ़ाइल फ़ोटो अपलोड विफल होगा';

  @override
  String get labRun => 'चलाएँ';

  @override
  String get labReset => 'डेमो डेटा रीसेट करें';

  @override
  String get labResetDone => 'डेमो सुरक्षा डेटा रीसेट हो गया';

  @override
  String get labOpenAlert => 'अलर्ट खोलें';

  @override
  String get labTrySignIn => 'साइन आउट करके साइन-इन स्क्रीन आज़माएँ';

  @override
  String get labNormalTitle => 'सामान्य लॉगिन';

  @override
  String get labNormalBody => 'इस डिवाइस से सफल साइन-इन। कोई अलर्ट नहीं।';

  @override
  String get labWrongTitle => 'गलत पासवर्ड';

  @override
  String get labWrongBody =>
      'एक असफल साइन-इन। प्रयास गिनती देखने के लिए इसे दोहराएँ।';

  @override
  String get labMaxTitle => 'अधिकतम असफल प्रयास';

  @override
  String get labMaxBody =>
      'सीमा तक पहुँचता है: सुरक्षा शुरू होती है, और इवेंट, सूचना व ईमेल बनते हैं।';

  @override
  String get labSuspiciousTitle => 'संदिग्ध लॉगिन सूचना';

  @override
  String get labSuspiciousBody =>
      'अज्ञात डिवाइस से साइन-इन का प्रयास अलर्ट उठाता है।';

  @override
  String get labPasswordTitle => 'पासवर्ड बदला गया';

  @override
  String get labPasswordBody =>
      'बदलाव दर्ज करता है और अलर्ट भेजता है (आपका पासवर्ड वही रहता है)।';

  @override
  String get labNewDeviceTitle => 'नए डिवाइस से लॉगिन';

  @override
  String get labNewDeviceBody =>
      'आपके डिवाइस में एक नया फ़ोन \"नया लॉगिन\" अलर्ट के साथ दिखता है।';

  @override
  String get labRevokedTitle => 'सत्र रद्द किया गया';

  @override
  String get labRevokedBody =>
      'एक और डिवाइस लॉग आउट होता है, \"डिवाइस हटाया गया\" अलर्ट के साथ।';

  @override
  String get labPhotoTitle => 'फ़ोटो अपलोड विफल';

  @override
  String get labPhotoBody =>
      'अगला प्रोफ़ाइल फ़ोटो अपलोड विफल होता है ताकि आप त्रुटि देख सकें और दोबारा कोशिश कर सकें।';

  @override
  String get fpTitle => 'पासवर्ड भूल गए';

  @override
  String fpStep(int current, int total) {
    return 'चरण $current / $total';
  }

  @override
  String get fpChooseTitle => 'हम आपकी पुष्टि कैसे करें?';

  @override
  String get fpChooseBody => 'चुनें कि सत्यापन कोड कहाँ भेजा जाए।';

  @override
  String get fpViaEmail => 'ईमेल से पासवर्ड रीसेट करें';

  @override
  String get fpViaPhone => 'फ़ोन से पासवर्ड रीसेट करें';

  @override
  String get fpEmailBody => 'हम आपके ईमेल पर सत्यापन कोड भेजेंगे।';

  @override
  String get fpPhoneBody => 'हम आपके फ़ोन पर सत्यापन कोड का संदेश भेजेंगे।';

  @override
  String get fpEmailLabel => 'ईमेल पता';

  @override
  String get fpPhoneLabel => 'फ़ोन नंबर';

  @override
  String get fpSendCode => 'सत्यापन कोड भेजें';

  @override
  String get fpSendOtp => 'OTP भेजें';

  @override
  String get fpVerifyCode => 'कोड सत्यापित करें';

  @override
  String get fpNewTitle => 'नया पासवर्ड बनाएँ';

  @override
  String get fpNewBody =>
      'ऐसा मज़बूत पासवर्ड चुनें जो आपने पहले इस्तेमाल नहीं किया।';

  @override
  String get fpSave => 'पासवर्ड रीसेट करें';

  @override
  String get fpDoneTitle => 'पासवर्ड सफलतापूर्वक बदल गया';

  @override
  String get fpDoneBody => 'अब आप अपने नए पासवर्ड से साइन-इन कर सकते हैं।';

  @override
  String get fpDoneBodyInApp =>
      'आपका पासवर्ड अपडेट हो गया है और आपकी सुरक्षा के लिए बाकी डिवाइस साइन आउट कर दिए गए हैं।';

  @override
  String get fpBackToSignIn => 'साइन-इन पर लौटें';

  @override
  String get fpErrEmail => 'सही ईमेल पता दर्ज करें।';

  @override
  String get fpErrPhone => '10 अंकों का सही मोबाइल नंबर दर्ज करें।';

  @override
  String get fpTooMany => 'बहुत ज़्यादा प्रयास। कृपया बाद में फिर कोशिश करें।';

  @override
  String get fpExpired => 'यह सत्यापन समाप्त हो गया। कृपया दोबारा शुरू करें।';

  @override
  String get fpDemoAny => 'डेमो: कोई भी सही ईमेल या फ़ोन नंबर चलेगा।';

  @override
  String get ccCurrentEmail => 'मौजूदा ईमेल';

  @override
  String get ccCurrentPhone => 'मौजूदा फ़ोन नंबर';

  @override
  String get ccNewEmail => 'नया ईमेल पता';

  @override
  String get ccNewPhone => 'नया फ़ोन नंबर';

  @override
  String get ccPasswordHint =>
      'आपकी सुरक्षा के लिए, आगे बढ़ने हेतु अपना पासवर्ड दर्ज करें।';

  @override
  String get ccSendCode => 'सत्यापन कोड भेजें';

  @override
  String get ccConfirmTitle => 'बदलाव की पुष्टि करें';

  @override
  String ccConfirmBodyEmail(String value) {
    return 'आपका BLOCKS ईमेल $value में बदल जाएगा।';
  }

  @override
  String ccConfirmBodyPhone(String value) {
    return 'आपका BLOCKS फ़ोन नंबर $value में बदल जाएगा।';
  }

  @override
  String get ccConfirm => 'पुष्टि करें';

  @override
  String get ccDoneEmailTitle => 'ईमेल अपडेट हो गया';

  @override
  String get ccDoneEmailBody =>
      'हमने आपके पिछले पते पर अलर्ट भेजा है ताकि आपको पता रहे कि यह आपने किया।';

  @override
  String get ccDonePhoneTitle => 'फ़ोन नंबर अपडेट हो गया';

  @override
  String get ccDonePhoneBody => 'आपका नया नंबर अब आपके खाते में है।';

  @override
  String get ccErrSameEmail => 'यह पहले से आपका मौजूदा ईमेल है।';

  @override
  String get ccErrSamePhone => 'यह पहले से आपका मौजूदा फ़ोन नंबर है।';

  @override
  String get epTitle => 'प्रोफ़ाइल संपादित करें';

  @override
  String get epSave => 'सहेजें';

  @override
  String get epSaveChanges => 'बदलाव सहेजें';

  @override
  String get epSaved => 'प्रोफ़ाइल अपडेट हो गई';

  @override
  String get epPublicSection => 'सार्वजनिक प्रोफ़ाइल';

  @override
  String get epPublicHint => 'BLOCKS पर कोई भी इसे देख सकता है।';

  @override
  String get epPrivateSection => 'निजी जानकारी';

  @override
  String get epPrivateHint => 'केवल आप इसे देख सकते हैं।';

  @override
  String get epName => 'पूरा नाम';

  @override
  String get epUsername => 'यूज़रनेम';

  @override
  String get epBio => 'बायो';

  @override
  String epBioCount(int n, int total) {
    return '$n/$total';
  }

  @override
  String get epWebsite => 'वेबसाइट';

  @override
  String get epLocation => 'स्थान';

  @override
  String get epCountry => 'देश';

  @override
  String get epState => 'राज्य';

  @override
  String get epDistrict => 'ज़िला';

  @override
  String get epDob => 'जन्म तिथि';

  @override
  String get epDobHint => 'अपनी जन्म तिथि चुनें';

  @override
  String get epGender => 'लिंग';

  @override
  String get epGenderFemale => 'महिला';

  @override
  String get epGenderMale => 'पुरुष';

  @override
  String get epGenderNonBinary => 'नॉन-बाइनरी';

  @override
  String get epGenderPrefer => 'बताना नहीं चाहते';

  @override
  String get epLanguage => 'भाषा';

  @override
  String get epLanguageHint => 'पूरे ऐप पर तुरंत लागू होती है।';

  @override
  String get epUsernameChecking => 'उपलब्धता जाँची जा रही है...';

  @override
  String get epUsernameAvailable => 'यह यूज़रनेम उपलब्ध है';

  @override
  String epErrNameShort(int n) {
    return 'कम से कम $n अक्षर दर्ज करें।';
  }

  @override
  String epErrNameLong(int n) {
    return '$n अक्षर या उससे कम रखें।';
  }

  @override
  String epErrUsernameShort(int n) {
    return 'कम से कम $n अक्षर इस्तेमाल करें।';
  }

  @override
  String epErrUsernameLong(int n) {
    return '$n अक्षर या उससे कम रखें।';
  }

  @override
  String get epErrUsernameChars =>
      'केवल अक्षर, अंक, डॉट और अंडरस्कोर इस्तेमाल करें। यह डॉट से शुरू या खत्म नहीं हो सकता।';

  @override
  String get epErrUsernameReserved => 'यह यूज़रनेम उपलब्ध नहीं है।';

  @override
  String get epErrUsernameTaken => 'यह यूज़रनेम पहले से लिया जा चुका है।';

  @override
  String epErrBioLong(int n) {
    return 'बायो $n अक्षरों से कम रखें।';
  }

  @override
  String get epErrWebsite => 'सही वेबसाइट दर्ज करें, जैसे example.com।';

  @override
  String get epErrDobFuture => 'जन्म तिथि भविष्य की नहीं हो सकती।';

  @override
  String epErrDobAge(int n) {
    return 'आपकी उम्र कम से कम $n वर्ष होनी चाहिए।';
  }

  @override
  String get epErrDobInvalid => 'सही जन्म तिथि दर्ज करें।';

  @override
  String get epDiscard => 'बदलाव छोड़ दें?';

  @override
  String get epDiscardBody => 'आपके संपादन खो जाएँगे।';

  @override
  String get epDiscardConfirm => 'छोड़ें';

  @override
  String get epKeepEditing => 'संपादन जारी रखें';

  @override
  String get phTitle => 'प्रोफ़ाइल फ़ोटो बदलें';

  @override
  String get phTake => 'फ़ोटो खींचें';

  @override
  String get phChoose => 'गैलरी से चुनें';

  @override
  String get phRemove => 'फ़ोटो हटाएँ';

  @override
  String get phRemoveTitle => 'अपनी फ़ोटो हटाएँ?';

  @override
  String get phRemoveBody =>
      'आपकी प्रोफ़ाइल पर इसकी जगह आपके नाम के पहले अक्षर दिखेंगे।';

  @override
  String get phEditSemantics => 'प्रोफ़ाइल फ़ोटो बदलें';

  @override
  String phUploading(int percent) {
    return 'फ़ोटो अपलोड हो रही है... $percent%';
  }

  @override
  String get phDone => 'प्रोफ़ाइल फ़ोटो अपडेट हो गई';

  @override
  String get phRemoved => 'प्रोफ़ाइल फ़ोटो हटा दी गई';

  @override
  String get phErrUnsupported => 'JPG, PNG या WebP फ़ोटो इस्तेमाल करें।';

  @override
  String phErrTooLarge(int n) {
    return 'यह फ़ोटो बहुत बड़ी है। $n MB से छोटी फ़ोटो चुनें।';
  }

  @override
  String get phErrNetwork =>
      'फ़ोटो अपलोड नहीं हो सकी। अपना कनेक्शन जाँचें और फिर कोशिश करें।';

  @override
  String get phErrPick => 'आपका कैमरा या गैलरी नहीं खुल सकी।';

  @override
  String get settingsEmail => 'ईमेल';

  @override
  String get settingsPhone => 'फ़ोन';

  @override
  String get settingsPassword => 'पासवर्ड';

  @override
  String get settingsSectionPrivacySafety => 'गोपनीयता और सुरक्षा';

  @override
  String get secOverview => 'सुरक्षा का अवलोकन';

  @override
  String reelVideoSemantics(String name) {
    return '$name की रील। चलाने या रोकने के लिए टैप करें, पसंद करने के लिए दो बार टैप करें।';
  }

  @override
  String get audiencePrivate => 'निजी';

  @override
  String get evPayoutAccountChanged => 'पेआउट खाता बदला गया';

  @override
  String get evIdentityChanged => 'पहचान विवरण जमा किए गए';

  @override
  String get rsToolClips => 'क्लिप्स';

  @override
  String get rsToolTrim => 'ट्रिम';

  @override
  String get rsToolMusic => 'संगीत';

  @override
  String get rsToolText => 'टेक्स्ट';

  @override
  String get rsToolStickers => 'स्टिकर';

  @override
  String get rsToolFilters => 'फ़िल्टर';

  @override
  String get rsToolAdjust => 'समायोजन';

  @override
  String get rsToolTransitions => 'ट्रांज़िशन';

  @override
  String get rsToolCover => 'कवर';

  @override
  String get fltOriginal => 'मूल';

  @override
  String get fltVivid => 'जीवंत';

  @override
  String get fltWarm => 'गर्म';

  @override
  String get fltCool => 'ठंडा';

  @override
  String get fltCinematic => 'सिनेमाई';

  @override
  String get fltPortrait => 'पोर्ट्रेट';

  @override
  String get fltVintage => 'विंटेज';

  @override
  String get fltBw => 'श्वेत-श्याम';

  @override
  String get fltGolden => 'सुनहरा समय';

  @override
  String get fltIndia => 'भारत';

  @override
  String get fltUrban => 'शहरी';

  @override
  String get fltFood => 'खाने के शौकीन';

  @override
  String get fltTravel => 'यात्रा';

  @override
  String get fltNight => 'रात';

  @override
  String get trNone => 'कोई नहीं';

  @override
  String get trFade => 'फ़ेड';

  @override
  String get trSlide => 'स्लाइड';

  @override
  String get trZoom => 'ज़ूम';

  @override
  String get trWipe => 'वाइप';

  @override
  String get stkEmoji => 'इमोजी';

  @override
  String get stkIndia => 'भारत';

  @override
  String get stkTravel => 'यात्रा';

  @override
  String get stkFood => 'खाना';

  @override
  String get stkBusiness => 'व्यापार';

  @override
  String get stkLove => 'प्यार';

  @override
  String get stkFunny => 'मज़ेदार';

  @override
  String get stkFestival => 'त्योहार';

  @override
  String get stkSports => 'खेल';

  @override
  String get stkCelebration => 'जश्न';

  @override
  String get fontClean => 'साफ़';

  @override
  String get fontSerif => 'सेरिफ़';

  @override
  String get fontMono => 'मोनो';

  @override
  String get fontDisplay => 'डिस्प्ले';

  @override
  String get fontScript => 'स्क्रिप्ट';

  @override
  String get anNone => 'कोई नहीं';

  @override
  String get anFade => 'फ़ेड';

  @override
  String get anPop => 'पॉप';

  @override
  String get anSlideUp => 'ऊपर स्लाइड';

  @override
  String get anTypewriter => 'टाइपराइटर';

  @override
  String get adjBrightness => 'चमक';

  @override
  String get adjContrast => 'कंट्रास्ट';

  @override
  String get adjSaturation => 'संतृप्ति';

  @override
  String get adjWarmth => 'गर्माहट';

  @override
  String get adjHighlights => 'हाइलाइट';

  @override
  String get adjShadows => 'छाया';

  @override
  String get adjSharpness => 'तीखापन';

  @override
  String get adjFade => 'फ़ेड';

  @override
  String get adjVignette => 'विग्नेट';

  @override
  String get musTrending => 'ट्रेंडिंग';

  @override
  String get musPopular => 'लोकप्रिय';

  @override
  String get musNew => 'नई रिलीज़';

  @override
  String get musHindi => 'हिन्दी';

  @override
  String get musTelugu => 'तेलुगु';

  @override
  String get musTamil => 'तमिल';

  @override
  String get musBengali => 'बांग्ला';

  @override
  String get musMarathi => 'मराठी';

  @override
  String get musPunjabi => 'पंजाबी';

  @override
  String get musKannada => 'कन्नड़';

  @override
  String get musMalayalam => 'मलयालम';

  @override
  String get musInstrumental => 'वाद्य';

  @override
  String get musDevotional => 'भक्ति';

  @override
  String get musTravel => 'यात्रा';

  @override
  String get musFitness => 'फ़िटनेस';

  @override
  String get musRomantic => 'रोमांटिक';

  @override
  String get musComedy => 'कॉमेडी';

  @override
  String get rightsPlatform => 'BLOCKS लाइब्रेरी';

  @override
  String get rightsLicensed => 'लाइसेंस प्राप्त';

  @override
  String get rightsCreator => 'क्रिएटर का';

  @override
  String get rightsFree => 'रॉयल्टी-मुक्त';

  @override
  String get rightsRestricted => 'प्रतिबंधित';

  @override
  String get qualDataSaver => 'डेटा सेवर';

  @override
  String get qualBalanced => 'संतुलित';

  @override
  String get qualHigh => 'उच्च';

  @override
  String get qualOriginal => 'मूल';

  @override
  String get qualDataSaverHint =>
      'सबसे छोटा अपलोड। धीमे या महंगे डेटा के लिए अच्छा।';

  @override
  String get qualBalancedHint => 'अनुशंसित। छोटी फ़ाइल के साथ साफ़ तस्वीर।';

  @override
  String get qualHighHint => 'ऊँचे बिटरेट पर ज़्यादा स्पष्टता।';

  @override
  String get qualOriginalHint =>
      'कोई कंप्रेशन नहीं। सबसे बड़ा और अपलोड में सबसे धीमा।';

  @override
  String get pubPreparing => 'तैयारी';

  @override
  String get pubCompressing => 'कंप्रेस हो रहा है';

  @override
  String get pubProcessing => 'प्रोसेस हो रहा है';

  @override
  String get pubUploading => 'अपलोड हो रहा है';

  @override
  String get pubServer => 'सर्वर पर प्रोसेसिंग';

  @override
  String get pubModeration => 'समीक्षा';

  @override
  String get rsPickFromPhone => 'अपने फ़ोन से चुनें';

  @override
  String get rsPhoneEmptyTitle => 'फ़ोटो और वीडियो चुनें';

  @override
  String get rsPhoneEmptyBody =>
      'अपनी रील में डालने के लिए फ़ोन से चुनें। BLOCKS के साथ केवल वही फ़ाइलें साझा होती हैं जो आप चुनते हैं।';

  @override
  String get rsPickUnsupported =>
      'यह फ़ाइल इस्तेमाल नहीं हो सकती। MP4 या MOV वीडियो, या JPG, PNG या WebP फ़ोटो इस्तेमाल करें।';

  @override
  String get rsPickFailed => 'गैलरी नहीं खुल सकी। कृपया फिर कोशिश करें।';

  @override
  String rsPickSomeSkipped(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count फ़ाइलें छोड़ दी गईं क्योंकि वे सीमा तोड़ती थीं।',
      one: 'एक फ़ाइल छोड़ दी गई क्योंकि वह सीमा तोड़ती।',
    );
    return '$_temp0';
  }

  @override
  String get pubInReview => 'समीक्षा में';

  @override
  String get pubInReviewTitle => 'रील जमा हो गई';

  @override
  String get pubInReviewBody =>
      'आपकी रील हमारी समीक्षा टीम के पास है। मंज़ूर होते ही यह लाइव हो जाएगी, और तब आप इसे क्रिएटर स्टूडियो में देखेंगे।';

  @override
  String get pubPublished => 'प्रकाशित';

  @override
  String get pubFailed => 'विफल';

  @override
  String get pubTitle => 'प्रकाशित हो रहा है';

  @override
  String get pubKeepOpen => 'कृपया रील प्रकाशित होने तक BLOCKS खुला रखें।';

  @override
  String pubFileOf(int current, int total) {
    return 'फ़ाइल $current / $total';
  }

  @override
  String pubBytesOf(String sent, String size) {
    return '$size में से $sent अपलोड हुआ';
  }

  @override
  String get pubServerBody =>
      'BLOCKS आपकी रील को हर स्क्रीन के लिए तैयार कर रहा है।';

  @override
  String get pubModerationBody =>
      'सुरक्षा, कॉपीराइट और कम्युनिटी नियमों की जाँच हो रही है।';

  @override
  String get pubCheckSafety => 'सुरक्षा जाँच';

  @override
  String get pubCheckCopyright => 'कॉपीराइट जाँच';

  @override
  String get pubCheckPolicy => 'नीति जाँच';

  @override
  String get pubDone => 'पूरा';

  @override
  String get pubInProgress => 'जारी है';

  @override
  String get pubWaiting => 'प्रतीक्षा में';

  @override
  String get pubPublishedTitle => 'रील प्रकाशित ✓';

  @override
  String pubPublishedBody(String district) {
    return 'आपकी रील $district में खोज के लिए पात्र है।';
  }

  @override
  String get pubViewReels => 'रील्स पर जाएँ';

  @override
  String get pubOpenStudio => 'क्रिएटर स्टूडियो खोलें';

  @override
  String get pubFailedTitle => 'अपलोड विफल';

  @override
  String get pubFailNetwork =>
      'कनेक्शन टूट गया। कुछ भी नहीं खोया, अपलोड वहीं से जारी रहेगा जहाँ रुका था।';

  @override
  String pubFailModeration(String reason) {
    return 'यह रील प्रकाशित नहीं हो सकती। कारण: $reason।';
  }

  @override
  String get pubFailCancelled => 'प्रकाशन रोक दिया गया।';

  @override
  String get pubFailLimits =>
      'आपकी रील लंबाई या आकार की सीमा पूरी नहीं करती। संपादित करके फिर कोशिश करें।';

  @override
  String get pubFailUnknown => 'कुछ गड़बड़ हुई। कृपया फिर कोशिश करें।';

  @override
  String get pubSavedAsDraft => 'आपकी रील ड्राफ़्ट के रूप में सेव है।';

  @override
  String get pubRetry => 'फिर कोशिश करें';

  @override
  String get pubEditReel => 'रील संपादित करें';

  @override
  String get pubSaveDraft => 'ड्राफ़्ट सेव करें';

  @override
  String get pubLeaveTitle => 'प्रकाशन रोकें?';

  @override
  String get pubLeaveBody =>
      'आपकी रील ड्राफ़्ट में सेव रहेगी, आप बाद में प्रकाशित कर सकते हैं।';

  @override
  String get pubLeaveStay => 'प्रकाशित करते रहें';

  @override
  String get pubLeaveCancel => 'रोकें और ड्राफ़्ट सेव करें';

  @override
  String get rsTitle => 'नई रील';

  @override
  String get rsSaveDraft => 'ड्राफ़्ट सेव करें';

  @override
  String get rsNext => 'आगे';

  @override
  String get rsPublish => 'रील प्रकाशित करें';

  @override
  String get rsPlay => 'प्रिव्यू चलाएँ';

  @override
  String get rsPause => 'प्रिव्यू रोकें';

  @override
  String get rsPreviewEmpty =>
      'अपनी रील शुरू करने के लिए वीडियो या फ़ोटो जोड़ें।';

  @override
  String rsPreviewLabel(String time, String length) {
    return 'प्रिव्यू $length में से $time पर';
  }

  @override
  String rsSeekValue(String time) {
    return '$time';
  }

  @override
  String rsTextLayer(String text) {
    return 'टेक्स्ट: $text';
  }

  @override
  String rsStickerLayer(String sticker) {
    return 'स्टिकर $sticker';
  }

  @override
  String get rsTimeline => 'टाइमलाइन';

  @override
  String rsTotalOfLimit(String used, String limit) {
    return '$limit में से $used';
  }

  @override
  String get rsTimelineEmpty => 'आपकी क्लिप यहाँ दिखेंगी।';

  @override
  String get rsAddMedia => 'मीडिया जोड़ें';

  @override
  String get rsPhoto => 'फ़ोटो';

  @override
  String get rsVideo => 'वीडियो';

  @override
  String rsClipLabel(int index, int count, String type, String length) {
    return 'क्लिप $index / $count, $type, $length';
  }

  @override
  String get rsMoveEarlier => 'पहले करें';

  @override
  String get rsMoveLater => 'बाद में करें';

  @override
  String get rsClipsEmpty => 'संपादन शुरू करने के लिए वीडियो और फ़ोटो जोड़ें।';

  @override
  String get rsSelectClip =>
      'संपादित करने के लिए टाइमलाइन में कोई क्लिप चुनें।';

  @override
  String get rsReplace => 'बदलें';

  @override
  String get rsDuplicate => 'डुप्लिकेट';

  @override
  String get rsSplit => 'यहाँ बाँटें';

  @override
  String get rsDelete => 'हटाएँ';

  @override
  String get rsVolume => 'आवाज़';

  @override
  String get rsPhotoDuration => 'यह फ़ोटो कितनी देर दिखे';

  @override
  String rsSecondsShort(int seconds) {
    return '$seconds सेक';
  }

  @override
  String rsMinutesShort(int minutes) {
    return '$minutes मिनट';
  }

  @override
  String get rsTrimPhoto =>
      'फ़ोटो को ट्रिम करने की ज़रूरत नहीं। चुनें कि यह कितनी देर स्क्रीन पर रहे।';

  @override
  String get rsTrimUnavailable => 'यह क्लिप ट्रिम नहीं हो सकती।';

  @override
  String get rsTrimRange => 'ट्रिम शुरू और अंत';

  @override
  String rsTrimStart(String time) {
    return 'शुरू $time';
  }

  @override
  String rsTrimEnd(String time) {
    return 'अंत $time';
  }

  @override
  String rsTrimLength(String length) {
    return 'लंबाई $length';
  }

  @override
  String get rsResetTrim => 'ट्रिम रीसेट करें';

  @override
  String get rsTransitionBody => 'यह क्लिप अगली क्लिप में कैसे बदलती है।';

  @override
  String get rsTransitionLast =>
      'आखिरी क्लिप के बाद कोई क्लिप नहीं, इसलिए ट्रांज़िशन नहीं।';

  @override
  String get rsApplyToAll => 'सभी क्लिप पर लागू करें';

  @override
  String get rsIntensity => 'तीव्रता';

  @override
  String get rsResetAdjust => 'रीसेट';

  @override
  String get rsOriginalAudio => 'मूल ऑडियो';

  @override
  String get rsOriginalAudioBody => 'आपकी अपनी क्लिप की आवाज़।';

  @override
  String rsMusicSelected(String title, String artist) {
    return '$artist का $title';
  }

  @override
  String rsMusicClipRange(String artist, String start, String end) {
    return '$artist · $start–$end';
  }

  @override
  String get rsAddMusic => 'संगीत जोड़ें';

  @override
  String get rsChangeMusic => 'संगीत बदलें';

  @override
  String get rsEditMusicClip => 'हिस्सा चुनें';

  @override
  String get rsRemoveMusic => 'संगीत हटाएँ';

  @override
  String get rsOriginalSound => 'मूल आवाज़';

  @override
  String get rsCoverPreview => 'कवर प्रिव्यू';

  @override
  String get rsCoverFirst => 'पहला फ़्रेम';

  @override
  String get rsCoverFrame => 'फ़्रेम चुनें';

  @override
  String get rsCoverImage => 'फ़ोटो से';

  @override
  String get rsCoverAt => 'फ़्रेम का समय';

  @override
  String get rsCoverPhotos => 'फ़ोटो चुनें';

  @override
  String rsCoverPhotoN(int index) {
    return 'फ़ोटो $index';
  }

  @override
  String get rsCoverText => 'कवर टेक्स्ट';

  @override
  String get rsCoverTextHint => 'आपके कवर का छोटा शीर्षक';

  @override
  String get rsLayers => 'लेयर';

  @override
  String get rsTextNew => 'नया टेक्स्ट';

  @override
  String get rsTextHint => 'कुछ लिखें…';

  @override
  String get rsTextAdd => 'जोड़ें';

  @override
  String get rsTextEdit => 'टेक्स्ट बदलें';

  @override
  String get rsFont => 'फ़ॉन्ट';

  @override
  String get rsColor => 'रंग';

  @override
  String rsColorSwatch(String color) {
    return 'रंग $color';
  }

  @override
  String get rsAlignment => 'संरेखण';

  @override
  String get rsAlignStart => 'बाएँ';

  @override
  String get rsAlignCenter => 'बीच में';

  @override
  String get rsAlignEnd => 'दाएँ';

  @override
  String get rsBackground => 'पृष्ठभूमि';

  @override
  String get rsNoBackground => 'कोई नहीं';

  @override
  String rsBackgroundSwatch(String color) {
    return 'पृष्ठभूमि रंग $color';
  }

  @override
  String get rsOpacity => 'अपारदर्शिता';

  @override
  String get rsAnimation => 'एनिमेशन';

  @override
  String get rsSize => 'आकार';

  @override
  String get rsRotation => 'घुमाव';

  @override
  String get rsVisibleBetween => 'स्क्रीन पर दिखने का समय';

  @override
  String rsVisibleFor(String length, String start) {
    return '$start से $length तक दिखेगा';
  }

  @override
  String rsAddSticker(String sticker) {
    return 'स्टिकर $sticker जोड़ें';
  }

  @override
  String get rsStickerHint =>
      'स्टिकर जोड़ने के लिए टैप करें। प्रिव्यू पर खींचकर हिलाएँ; दो उँगलियों से आकार और घुमाव बदलें।';

  @override
  String get rsLengthLimit => 'रील की लंबाई';

  @override
  String get rsIssueNoClips => 'कम से कम एक वीडियो या फ़ोटो जोड़ें।';

  @override
  String rsIssueTooLong(int seconds) {
    return 'आपकी रील $seconds सेकंड से लंबी है। कोई क्लिप ट्रिम करें या ज़्यादा लंबाई चुनें।';
  }

  @override
  String rsIssueTooManyClips(int count) {
    return 'एक रील में अधिकतम $count क्लिप इस्तेमाल हो सकती हैं।';
  }

  @override
  String rsIssueTooManyPhotos(int count) {
    return 'एक रील में अधिकतम $count फ़ोटो इस्तेमाल हो सकती हैं।';
  }

  @override
  String rsIssueVideoTooLarge(int mb) {
    return 'वीडियो अधिकतम $mb MB के हो सकते हैं।';
  }

  @override
  String get rsIssueClipTooShort => 'आपकी एक क्लिप बहुत छोटी है।';

  @override
  String get rsSliverCut => 'वहाँ काटने से क्लिप बहुत छोटी रह जाएगी।';

  @override
  String get rsDraftSaved => 'ड्राफ़्ट में सेव हुआ';

  @override
  String get rsDraftSaveFailed => 'ड्राफ़्ट सेव नहीं हो सका। फिर कोशिश करें।';

  @override
  String get rsMusicUnavailable => 'वह ट्रैक अब उपलब्ध नहीं है।';

  @override
  String get rsLeaveTitle => 'एडिटर छोड़ें?';

  @override
  String get rsLeaveBody => 'आपके बदलाव सेव नहीं हुए हैं।';

  @override
  String get rsLeaveStay => 'संपादन जारी रखें';

  @override
  String get rsLeaveDiscard => 'रद्द करें';

  @override
  String get rsLeaveSave => 'ड्राफ़्ट सेव करें';

  @override
  String get rsPickerTitle => 'अपनी रील में जोड़ें';

  @override
  String get rsPickerBody =>
      'वीडियो और फ़ोटो को उस क्रम में टैप करें जिसमें चाहिए। बाद में क्रम बदल सकते हैं।';

  @override
  String get rsReplaceTitle => 'क्लिप बदलें';

  @override
  String get rsReplaceBody =>
      'इसकी जगह इस्तेमाल करने के लिए वीडियो या फ़ोटो चुनें।';

  @override
  String get rsFilterAll => 'सभी';

  @override
  String get rsFilterVideos => 'वीडियो';

  @override
  String get rsFilterPhotos => 'फ़ोटो';

  @override
  String get rsRecord => 'वीडियो रिकॉर्ड करें';

  @override
  String get rsRecordFailed => 'रिकॉर्ड नहीं हो सका। फिर कोशिश करें।';

  @override
  String get rsPickerEmpty => 'यहाँ अभी कुछ नहीं';

  @override
  String get rsPickerEmptyBody =>
      'वीडियो रिकॉर्ड करें या गैलरी में फ़ोटो जोड़ें।';

  @override
  String rsPickerAdd(int count) {
    return '$count रील में जोड़ें';
  }

  @override
  String get rsPickerAddNone => 'वीडियो या फ़ोटो चुनें';

  @override
  String rsSelectedSummary(int videos, int photos) {
    return '$videos वीडियो, $photos फ़ोटो';
  }

  @override
  String rsSelectedN(int n) {
    return 'चुना गया, क्रम $n';
  }

  @override
  String get rsTooLarge => 'बहुत बड़ा';

  @override
  String rsGalleryItemTooLarge(String type, String size) {
    return '$type, $size। जोड़ने के लिए बहुत बड़ा।';
  }

  @override
  String get rsMusicTitle => 'संगीत जोड़ें';

  @override
  String get rsMusicSearchHint => 'शीर्षक, कलाकार, भाषा या शैली खोजें';

  @override
  String get rsClearSearch => 'खोज साफ़ करें';

  @override
  String get rsAllMusic => 'सारा संगीत';

  @override
  String get rsTrendingNow => 'अभी ट्रेंडिंग';

  @override
  String get rsMusicRightsNote =>
      'यहाँ का हर ट्रैक लाइसेंस प्राप्त है, BLOCKS का है, या ऐसे क्रिएटर्स का है जिन्होंने इस्तेमाल की अनुमति दी है।';

  @override
  String get rsMusicEmpty => 'कोई संगीत नहीं मिला';

  @override
  String get rsMusicEmptyBody => 'कोई और शब्द या श्रेणी आज़माएँ।';

  @override
  String rsReelsUsing(String reels) {
    return '$reels रील्स';
  }

  @override
  String rsTrackLabel(String title, String meta) {
    return '$title. $meta';
  }

  @override
  String rsPreviewOf(String title) {
    return '$title सुनें';
  }

  @override
  String rsStopPreviewOf(String title) {
    return '$title का प्रिव्यू रोकें';
  }

  @override
  String get rsClipTitle => 'इस्तेमाल का हिस्सा चुनें';

  @override
  String get rsClipRange => 'संगीत की शुरुआत और अंत';

  @override
  String rsClipNote(String length) {
    return 'संगीत अधिकतम $length का हो सकता है, यानी आपकी रील जितना।';
  }

  @override
  String get rsPreviewClip => 'प्रिव्यू';

  @override
  String get rsStopPreview => 'रोकें';

  @override
  String get rsUseClip => 'यह हिस्सा इस्तेमाल करें';

  @override
  String get rsDetailsTitle => 'रील का विवरण';

  @override
  String get rsHashtags => 'हैशटैग';

  @override
  String get rsTagPeople => 'लोगों को टैग करें';

  @override
  String get rsTagNobody => 'किसी को टैग नहीं किया';

  @override
  String rsTaggedCount(int count) {
    return '$count लोग टैग किए गए';
  }

  @override
  String get rsTagSearchHint => 'लोगों को खोजें';

  @override
  String rsTagDone(int count) {
    return 'हो गया ($count)';
  }

  @override
  String get rsAllowComments => 'टिप्पणियों की अनुमति दें';

  @override
  String get rsAllowRemix => 'रीमिक्स की अनुमति दें';

  @override
  String get rsAllowRemixBody => 'दूसरे आपकी आवाज़ या रील पर आगे बना सकते हैं।';

  @override
  String get rsAllowSharing => 'शेयर करने की अनुमति दें';

  @override
  String get rsQualityTitle => 'अपलोड क्वालिटी';

  @override
  String get rsQualityBody =>
      'BLOCKS आपके फ़ोन पर फ़ाइलें छोटी करता है, ताकि अपलोड तेज़ हो और कम डेटा लगे।';

  @override
  String get rsSizeOriginal => 'मूल';

  @override
  String get rsSizeOptimized => 'ऑप्टिमाइज़्ड';

  @override
  String get rsSizeSaved => 'छोटा';

  @override
  String rsSizeSummary(String original, String optimized, int percent) {
    return 'मूल $original, ऑप्टिमाइज़्ड $optimized, $percent प्रतिशत छोटा';
  }

  @override
  String rsQualityNote(String resolution) {
    return 'वीडियो अधिकतम $resolution पर भेजे जाते हैं।';
  }

  @override
  String get rsQualityNoteOriginal =>
      'आपकी फ़ाइलें जैसी हैं वैसी ही भेजी जाती हैं। इसमें सबसे ज़्यादा डेटा लगता है।';

  @override
  String get rsServerNote =>
      'BLOCKS हर अपलोड को अपने सर्वर पर जाँचकर दोबारा एनकोड करता है, इसलिए गुणवत्ता और सुरक्षा आपके फ़ोन पर निर्भर नहीं रहती।';

  @override
  String get csNavLabel => 'क्रिएटर स्टूडियो के भाग';

  @override
  String get csNavOverview => 'अवलोकन';

  @override
  String get csNavReels => 'रील्स';

  @override
  String get csNavPosts => 'पोस्ट';

  @override
  String get csNavDrafts => 'ड्राफ़्ट';

  @override
  String get csNavAnalytics => 'एनालिटिक्स';

  @override
  String get csNavReach => 'पहुँच';

  @override
  String get csNavEarnings => 'कमाई';

  @override
  String get csNavPayout => 'पेआउट';

  @override
  String get csEstimatedChip => 'अनुमानित';

  @override
  String get csThisMonth => 'इस महीने';

  @override
  String csThisMonthAmount(String amount) {
    return 'इस महीने $amount';
  }

  @override
  String get csAvailable => 'उपलब्ध';

  @override
  String get csPending => 'लंबित';

  @override
  String get csPaid => 'भुगतान हुआ';

  @override
  String get csMenuTitle => 'आपका स्टूडियो';

  @override
  String get csHintReels => 'आपकी प्रकाशित रील्स';

  @override
  String get csHintPosts => 'फ़ोटो और टेक्स्ट पोस्ट';

  @override
  String get csHintDrafts => 'अधूरी रील्स';

  @override
  String csHintDraftsCount(int count) {
    return '$count अधूरी';
  }

  @override
  String get csHintAnalytics => 'व्यू, वॉच टाइम, ऑडियंस';

  @override
  String get csHintReach => 'रीच लैडर पर चढ़ें';

  @override
  String get csHintEarnings => 'अनुमानित इनाम';

  @override
  String get csHintPayout => 'सत्यापित करें, बैंक जोड़ें, निकालें';

  @override
  String get csPayoutSetupTitle => 'भुगतान पाएँ';

  @override
  String csPayoutSetupBody(String minimum) {
    return 'अपनी पहचान सत्यापित करें, बैंक खाता जोड़ें, फिर $minimum उपलब्ध होने पर निकालें।';
  }

  @override
  String get csPayoutReadyTitle => 'निकालने के लिए तैयार';

  @override
  String csPayoutReadyBody(String amount) {
    return '$amount निकालने के लिए उपलब्ध है।';
  }

  @override
  String get csStepIdentity => 'पहचान सत्यापित करें';

  @override
  String get csStepBank => 'बैंक खाता जोड़ें';

  @override
  String get csStepWithdraw => 'अपनी कमाई निकालें';

  @override
  String get csStepDone => 'पूरा';

  @override
  String get csSetUpPayouts => 'पेआउट सेट करें';

  @override
  String get csRequestPayout => 'पेआउट का अनुरोध करें';

  @override
  String get csNewReel => 'नई रील';

  @override
  String get csNewPost => 'नई पोस्ट';

  @override
  String get csNew => 'नया';

  @override
  String get csNoCaption => 'कोई कैप्शन नहीं';

  @override
  String get csReelsEmpty => 'अभी कोई रील नहीं';

  @override
  String get csReelsEmptyBody =>
      'अपनी पहली रील बनाएँ, वह आपके ज़िले से शुरू होगी।';

  @override
  String get csPostsEmpty => 'अभी कोई पोस्ट नहीं';

  @override
  String get csPostsEmptyBody =>
      'अपने ज़िले के साथ कोई फ़ोटो या विचार साझा करें।';

  @override
  String csReelRowLabel(String title, String views) {
    return '$title, $views व्यू';
  }

  @override
  String csViewsCount(String views) {
    return '$views व्यू';
  }

  @override
  String get csDraftsEmpty => 'कोई ड्राफ़्ट नहीं';

  @override
  String get csDraftsEmptyBody =>
      'संपादन के दौरान सेव की गई रील्स यहाँ दिखती हैं।';

  @override
  String get csDraftReady => 'प्रकाशन के लिए तैयार';

  @override
  String get csDraftNeedsChanges => 'बदलाव ज़रूरी';

  @override
  String csDraftClips(int count, String length) {
    return '$count क्लिप · $length';
  }

  @override
  String csDraftEdited(String ago) {
    return 'संपादित $ago';
  }

  @override
  String csDraftLabel(int count, String length, String status) {
    return '$count क्लिप का ड्राफ़्ट, $length, $status';
  }

  @override
  String get csContinueEditing => 'संपादन जारी रखें';

  @override
  String get csDraftDeleteTitle => 'यह ड्राफ़्ट हटाएँ?';

  @override
  String get csDraftDeleteBody =>
      'यह इस डिवाइस से हट जाएगा। आपकी गैलरी के वीडियो और फ़ोटो को कुछ नहीं होगा।';

  @override
  String get csDraftDeleted => 'ड्राफ़्ट हटाया गया';

  @override
  String get csDraftDuplicated => 'ड्राफ़्ट की कॉपी बनी';

  @override
  String get caRangeLabel => 'समय सीमा';

  @override
  String get caRange7 => '7 दिन';

  @override
  String get caRange28 => '28 दिन';

  @override
  String get caRange90 => '90 दिन';

  @override
  String get caViewsChartTitle => 'प्रति दिन व्यू';

  @override
  String caViewsChartSubtitle(String views, int days) {
    return '$days दिनों में $views व्यू';
  }

  @override
  String caViewsChartLabel(int days, String views) {
    return 'पिछले $days दिनों में प्रति दिन व्यू, कुल $views';
  }

  @override
  String get caViews => 'व्यू';

  @override
  String get caQualifiedViews => 'योग्य व्यू';

  @override
  String get caWatchTime => 'वॉच टाइम';

  @override
  String get caEngagement => 'एंगेजमेंट';

  @override
  String get caLikes => 'लाइक';

  @override
  String get caComments => 'टिप्पणियाँ';

  @override
  String get caShares => 'शेयर';

  @override
  String get caSaves => 'सेव';

  @override
  String get caFollowers => 'नए फ़ॉलोअर';

  @override
  String get caAudienceTitle => 'आपके दर्शक कहाँ हैं';

  @override
  String get caAudienceOther => 'अन्य स्थान';

  @override
  String get caReelsTitle => 'आपकी रील्स';

  @override
  String get caReelsHint => 'पूरे आँकड़े देखने के लिए रील पर टैप करें।';

  @override
  String get caCollecting => 'डेटा जुटाया जा रहा है';

  @override
  String get caCollectingBody =>
      'नई रील के आँकड़े प्रकाशित होने के कुछ देर बाद दिखते हैं।';

  @override
  String caCompletionShort(String rate) {
    return '$rate ने अंत तक देखा';
  }

  @override
  String caHours(int hours) {
    return '$hours घंटे';
  }

  @override
  String caMinutes(int minutes) {
    return '$minutes मिनट';
  }

  @override
  String get caReelTitle => 'रील एनालिटिक्स';

  @override
  String caQualifiedReachIs(String reach) {
    return '$reach योग्य पहुँच';
  }

  @override
  String get caReachTitle => 'रीच लैडर';

  @override
  String get caReachBody => 'यह रील ज़िले से वैश्विक तक कितना आगे बढ़ी है।';

  @override
  String get caAvgWatch => 'औसत वॉच';

  @override
  String caSecondsOf(int current, int total) {
    return '$total में से $current सेक';
  }

  @override
  String get caCompletion => 'अंत तक देखा';

  @override
  String get caEstEarnings => 'अनुमानित कमाई';

  @override
  String get caRetentionTitle => 'दर्शक रिटेंशन';

  @override
  String get caRetentionBody =>
      'रील की शुरुआत से अंत तक कितने दर्शक देखते रहे।';

  @override
  String caRetentionLabel(String rate) {
    return 'दर्शक रिटेंशन: $rate ने अंत तक देखा';
  }

  @override
  String get crYourLevel => 'आपका रीच स्तर';

  @override
  String crYourLevelBody(String reach) {
    return 'पिछले 30 दिनों में $reach योग्य पहुँच';
  }

  @override
  String get crLevelsTitle => 'चार स्तर';

  @override
  String get crLevelsBody =>
      'कंटेंट आपके ज़िले से शुरू होता है और ज़्यादा असली लोगों के देखने पर ऊपर चढ़ता है।';

  @override
  String crRange(String from, String to) {
    return '$from – $to योग्य पहुँच';
  }

  @override
  String crRangeOpen(String from) {
    return '$from+ योग्य पहुँच';
  }

  @override
  String get crLevelReached => 'पहुँच गए';

  @override
  String get crLevelLocked => 'अभी नहीं पहुँचे';

  @override
  String get crReelsTitle => 'लैडर पर आपकी रील्स';

  @override
  String get crReelsBody => 'हर रील अपने अगले स्तर से कितनी दूर है।';

  @override
  String crReelProgress(
    String title,
    String level,
    String remaining,
    String next,
  ) {
    return '$title: $level। $next तक पहुँचने के लिए $remaining और योग्य पहुँच चाहिए।';
  }

  @override
  String crReelTop(String title) {
    return '$title: लैडर के शीर्ष पर।';
  }

  @override
  String get crTopLevel => 'लैडर के शीर्ष पर';

  @override
  String crToNext(String remaining, String next) {
    return '$next तक पहुँचने में $remaining और';
  }

  @override
  String get crQualifiedTitle => 'योग्य पहुँच क्या है?';

  @override
  String get crQualifiedBody =>
      'योग्य पहुँच उन असली लोगों को गिनती है जिन्होंने सच में आपका कंटेंट देखा। एक ही व्यक्ति के बार-बार व्यू, बॉट और गलती से हुए टैप नहीं गिने जाते। हर स्तर की सीमाएँ BLOCKS तय करता है और ये बदल सकती हैं।';

  @override
  String get ceAvailableHint => 'निकालने के लिए तैयार';

  @override
  String get cePendingHint => 'अभी जाँच में';

  @override
  String get cePaidHint => 'आपके बैंक को भेजा गया';

  @override
  String get ceHeroNote =>
      'इस चक्र के इनाम का अनुमान। महीना पूरा होने पर यह पक्का होता है।';

  @override
  String get ceByLevelTitle => 'रीच स्तर के अनुसार कमाई';

  @override
  String get ceByLevelBody => 'आपके अनुमान के पीछे के व्यू कहाँ से आए।';

  @override
  String get ceLevelTotal => 'अनुमानित कुल';

  @override
  String get ceMonthsTitle => 'पिछले 6 महीने';

  @override
  String ceMonthsLabel(String amount) {
    return 'पिछले 6 महीनों की मासिक कमाई। इस महीने: $amount';
  }

  @override
  String get ceRewardTitle => 'क्वालिफ़ाइड क्रिएटर रिवॉर्ड';

  @override
  String get ceRewardBody =>
      'आपका इनाम प्रति व्यू तय रकम नहीं है। यह इस पर निर्भर है कि आपके कंटेंट को कितना गुणवत्तापूर्ण ध्यान मिलता है।';

  @override
  String get ceReachLevel => 'रीच स्तर';

  @override
  String get cePoolTitle => 'रिवॉर्ड पूल';

  @override
  String cePoolBody(String reach, String period) {
    return 'अब तक $reach योग्य पहुँच ($period)। क्रिएटर मासिक पूल को अपनी योग्य पहुँच और उसकी गुणवत्ता के अनुपात में बाँटते हैं।';
  }

  @override
  String get cePoolNote =>
      'अनुमानित। पूल और हर हिस्सा महीना बंद होने पर ही अंतिम होता है।';

  @override
  String get ceHowItWorks => 'इनाम कैसे काम करते हैं';

  @override
  String get ceHowTitle => 'क्वालिफ़ाइड क्रिएटर रिवॉर्ड कैसे काम करता है';

  @override
  String get ceHow1 =>
      'सिर्फ़ योग्य व्यू गिने जाते हैं: असली लोग, एक बार गिने गए, जिन्होंने काफ़ी देर देखा।';

  @override
  String get ceHow2 =>
      'वॉच टाइम, शेयर, सेव और एंगेजमेंट दिखाते हैं कि लोगों ने आपके कंटेंट को कितना महत्व दिया।';

  @override
  String get ceHow3 =>
      'आपका रीच स्तर भी मायने रखता है: लैडर पर आगे पहुँचने से पूल में आपका हिस्सा बढ़ता है।';

  @override
  String get ceHow4 =>
      'महीने के अंत में पूल क्रिएटर्स में बाँटा जाता है और आपकी रकम अंतिम हो जाती है।';

  @override
  String get ceHowDisclaimer =>
      'दिखाई गई रकमें अनुमान हैं। गुणवत्ता और धोखाधड़ी जाँच के बाद वे बदल सकती हैं, और भुगतान का वादा नहीं हैं।';

  @override
  String get ceGoToPayout => 'पेआउट सेंटर पर जाएँ';

  @override
  String get kycTitle => 'पहचान सत्यापन';

  @override
  String get kycFlowTitle => 'अपनी पहचान सत्यापित करें';

  @override
  String get kycNotStarted => 'शुरू नहीं हुआ';

  @override
  String get kycPending => 'लंबित';

  @override
  String get kycUnderReview => 'समीक्षा में';

  @override
  String get kycVerified => 'सत्यापित';

  @override
  String get kycRejected => 'अस्वीकृत';

  @override
  String get kycActionRequired => 'कार्रवाई ज़रूरी';

  @override
  String get kycExpired => 'समाप्त';

  @override
  String get kycHintNotStarted => 'पेआउट पाने के लिए अपनी पहचान सत्यापित करें।';

  @override
  String get kycHintPending =>
      'हमें आपके दस्तावेज़ मिल गए हैं, समीक्षा जल्द शुरू होगी।';

  @override
  String get kycHintUnderReview =>
      'आपके दस्तावेज़ों की समीक्षा हो रही है। पूरा होने पर आपको सूचना मिलेगी।';

  @override
  String get kycHintVerified => 'आपकी पहचान सत्यापित है। आप पेआउट पा सकते हैं।';

  @override
  String get kycHintRejected =>
      'हम इन दस्तावेज़ों से आपकी पहचान सत्यापित नहीं कर सके।';

  @override
  String get kycHintActionRequired =>
      'आगे बढ़ने के लिए हमें साफ़ या अलग दस्तावेज़ चाहिए।';

  @override
  String get kycHintExpired =>
      'आपका सत्यापन समाप्त हो गया है। पेआउट पाते रहने के लिए इसे नवीनीकृत करें।';

  @override
  String get kycReasonMismatch => 'नाम या विवरण दस्तावेज़ से मेल नहीं खाए।';

  @override
  String get kycReasonUnreadable => 'दस्तावेज़ साफ़ पढ़ा नहीं जा सका।';

  @override
  String get kycReasonBlurry => 'तस्वीर बहुत धुंधली थी।';

  @override
  String get kycReasonExpiredDocument =>
      'दस्तावेज़ की वैधता समाप्त हो चुकी है।';

  @override
  String get kycReasonGeneric => 'कृपया अपने विवरण जाँचें और फिर कोशिश करें।';

  @override
  String get kycIndividual => 'व्यक्ति';

  @override
  String get kycBusiness => 'व्यवसाय';

  @override
  String get kycIndividualBody => 'सरकारी पहचान पत्र से खुद को सत्यापित करें।';

  @override
  String get kycBusinessBody =>
      'पंजीकरण और अधिकृत व्यक्ति के साथ व्यवसाय सत्यापित करें।';

  @override
  String get kycDocReceived => 'प्राप्त';

  @override
  String get kycDocAccepted => 'स्वीकृत';

  @override
  String get kycDocRejected => 'अस्वीकृत';

  @override
  String get kycDetailsTitle => 'सत्यापन विवरण';

  @override
  String get kycType => 'प्रकार';

  @override
  String get kycLegalName => 'पूरा क़ानूनी नाम';

  @override
  String get kycBusinessName => 'व्यवसाय का नाम';

  @override
  String get kycSubmitted => 'जमा किया';

  @override
  String get kycReviewed => 'समीक्षा हुई';

  @override
  String get kycValidUntil => 'वैध है';

  @override
  String get kycDocumentsTitle => 'दस्तावेज़';

  @override
  String get kycMaskedNote =>
      'नंबर हमेशा छिपे दिखते हैं। BLOCKS कभी पूरा ID नंबर नहीं दिखाता।';

  @override
  String get kycStart => 'सत्यापन शुरू करें';

  @override
  String get kycRenew => 'सत्यापन नवीनीकृत करें';

  @override
  String get kycTryAgain => 'फिर कोशिश करें';

  @override
  String get kycCheckStatus => 'स्थिति जाँचें';

  @override
  String get kycPrivacyTitle => 'आपके दस्तावेज़ कैसे सुरक्षित हैं';

  @override
  String get kycPrivacy1 =>
      'सुरक्षित रूप से भेजे जाते हैं और निजी स्टोरेज में एन्क्रिप्ट करके रखे जाते हैं।';

  @override
  String get kycPrivacy2 => 'भेजने के बाद इस फ़ोन पर नहीं रखे जाते।';

  @override
  String get kycPrivacy3 =>
      'केवल एक छोटी प्रशिक्षित टीम इन्हें खोल सकती है, और हर पहुँच दर्ज होती है।';

  @override
  String get kycPrivacy4 =>
      'जब क़ानून को रखने की ज़रूरत नहीं रहती, तब इन्हें हटा दिया जाता है।';

  @override
  String kycStepOf(int current, int total) {
    return 'चरण $current / $total';
  }

  @override
  String get kycTypeTitle => 'किसे सत्यापित किया जा रहा है?';

  @override
  String get kycTypeBody => 'चुनें कि आप पेआउट कैसे पाएँगे।';

  @override
  String get kycDetailsHeading => 'आपके विवरण';

  @override
  String get kycDetailsBody =>
      'अपना नाम ठीक वैसे ही लिखें जैसा आपके दस्तावेज़ पर है।';

  @override
  String get kycNameHelp => 'आपके दस्तावेज़ और बैंक खाते से मेल खाना चाहिए।';

  @override
  String get kycSignatoryName => 'अधिकृत व्यक्ति का पूरा नाम';

  @override
  String get kycDocsHeading => 'आपके दस्तावेज़';

  @override
  String get kycDocsBody =>
      'दस्तावेज़ चुनें, उसका नंबर लिखें और साफ़ तस्वीर जोड़ें।';

  @override
  String get kycIdentityDoc => 'पहचान दस्तावेज़';

  @override
  String get kycBusinessDoc => 'व्यवसाय दस्तावेज़';

  @override
  String get kycSignatoryDoc => 'अधिकृत व्यक्ति का ID';

  @override
  String get kycNumber => 'नंबर';

  @override
  String get kycDocument => 'दस्तावेज़';

  @override
  String get kycFile => 'फ़ाइल';

  @override
  String get kycFileBack => 'पीछे का हिस्सा';

  @override
  String get kycFront => 'आगे';

  @override
  String get kycBack => 'पीछे';

  @override
  String get kycUploadFront => 'तस्वीर अपलोड करें';

  @override
  String get kycUploadBack => 'पीछे की तस्वीर अपलोड करें';

  @override
  String get kycNoFile => 'कोई फ़ाइल नहीं चुनी';

  @override
  String get kycChoose => 'चुनें';

  @override
  String get kycRemoveFile => 'फ़ाइल हटाएँ';

  @override
  String kycFileRules(int mb, String types) {
    return 'अधिकतम $mb MB। स्वीकृत: $types।';
  }

  @override
  String get kycFileNote =>
      'आपकी फ़ाइल सुरक्षित भेजी जाती है और इस फ़ोन पर नहीं रखी जाती।';

  @override
  String get kycFileCamera => 'फ़ोटो खींचें';

  @override
  String get kycFileGallery => 'गैलरी से चुनें';

  @override
  String get kycFilePdf => 'PDF चुनें';

  @override
  String get kycFileDemoLarge => 'डेमो: बहुत बड़ी फ़ाइल';

  @override
  String get kycErrName => 'केवल अक्षरों में अपना पूरा नाम लिखें।';

  @override
  String get kycErrBusiness => 'व्यवसाय का नाम लिखें।';

  @override
  String get kycErrNumber => 'यह नंबर इस दस्तावेज़ के लिए सही नहीं लगता।';

  @override
  String get kycErrFileLarge => 'वह फ़ाइल बहुत बड़ी है।';

  @override
  String get kycErrFileType => 'उस फ़ाइल का प्रकार स्वीकार्य नहीं है।';

  @override
  String get kycErrFileMissing => 'दस्तावेज़ की तस्वीर जोड़ें।';

  @override
  String get kycErrDocMissing => 'दस्तावेज़ चुनें और जोड़ें।';

  @override
  String get kycErrDocUnsupported => 'वह दस्तावेज़ यहाँ स्वीकार्य नहीं है।';

  @override
  String get kycReviewHeading => 'जाँचें और जमा करें';

  @override
  String get kycReviewBody => 'जाँच लें कि सब सही है। नंबर छिपे हुए दिखते हैं।';

  @override
  String get kycReviewWarning =>
      'आपके दस्तावेज़ समीक्षा के लिए सुरक्षित भेजे जाते हैं। गलत जानकारी देने पर आपका खाता प्रतिबंधित हो सकता है।';

  @override
  String get kycSubmit => 'सत्यापन के लिए जमा करें';

  @override
  String get kycProcessingNote =>
      'इसमें आमतौर पर थोड़ा समय लगता है। आप यह स्क्रीन छोड़ सकते हैं; पूरा होने पर हम बताएँगे।';

  @override
  String get kycStepReceived => 'दस्तावेज़ प्राप्त हुए';

  @override
  String get kycStepReview => 'समीक्षा';

  @override
  String get kycStepResult => 'परिणाम';

  @override
  String get bankEmptyTitle => 'अभी कोई बैंक खाता नहीं';

  @override
  String get bankEmptyBody => 'वह खाता जोड़ें जिसमें आप पेआउट पाना चाहते हैं।';

  @override
  String get bankAdd => 'बैंक खाता जोड़ें';

  @override
  String get bankAddTitle => 'बैंक खाता जोड़ें';

  @override
  String get bankSecurityNote =>
      'बैंक खाता जोड़ने, बदलने या हटाने पर आपका पासवर्ड और कोड माँगा जाता है, और BLOCKS आपको ई-मेल करता है।';

  @override
  String get bankPrimary => 'मुख्य';

  @override
  String get bankMakePrimary => 'मुख्य बनाएँ';

  @override
  String get bankRemove => 'हटाएँ';

  @override
  String get bankRemoveTitle => 'यह खाता हटाएँ?';

  @override
  String bankRemoveBody(String bank, String last4) {
    return '$bank •••• $last4 में अब पेआउट नहीं आएँगे।';
  }

  @override
  String get bankRemoved => 'बैंक खाता हटाया गया';

  @override
  String get bankPrimaryNow => 'यह अब आपका मुख्य खाता है';

  @override
  String bankCardLabel(String bank, String last4, String status) {
    return '$bank खाता, अंतिम अंक $last4, $status';
  }

  @override
  String get bankHolder => 'खाताधारक';

  @override
  String get bankHolderHelp => 'ठीक वैसा जैसा आपके बैंक खाते पर है।';

  @override
  String get bankAccountNumber => 'खाता संख्या';

  @override
  String get bankConfirmAccount => 'खाता संख्या की पुष्टि करें';

  @override
  String get bankIfsc => 'IFSC कोड';

  @override
  String get bankBranch => 'शाखा';

  @override
  String get bankType => 'खाते का प्रकार';

  @override
  String get bankSavings => 'बचत';

  @override
  String get bankCurrent => 'चालू';

  @override
  String get bankFormNote =>
      'आपकी खाता संख्या एक बार सुरक्षित भेजी जाती है, फिर कभी नहीं दिखती। केवल अंतिम 4 अंक दिखते हैं।';

  @override
  String get bankSaveAndVerify => 'सेव करके सत्यापित करें';

  @override
  String get bankVerifyingNow => 'आपके बैंक से जाँच हो रही है…';

  @override
  String get bankEditDetails => 'विवरण बदलें';

  @override
  String get bankManageAccounts => 'बैंक खाते प्रबंधित करें';

  @override
  String get bankAwaitingIdentity => 'पहचान जाँच की प्रतीक्षा';

  @override
  String get bankVerifying => 'सत्यापित हो रहा है';

  @override
  String get bankVerified => 'सत्यापित';

  @override
  String get bankNameMismatch => 'नाम मेल नहीं खाता';

  @override
  String get bankFailed => 'सत्यापन विफल';

  @override
  String get bankHintAwaitingIdentity =>
      'सेव हो गया। आपकी पहचान सत्यापित होते ही हम नाम जाँचेंगे।';

  @override
  String get bankHintVerifying => 'हम बैंक से इस खाते की जाँच कर रहे हैं।';

  @override
  String get bankHintVerified => 'इस खाते में पेआउट आ सकते हैं।';

  @override
  String get bankHintNameMismatch =>
      'खाताधारक का नाम आपकी सत्यापित पहचान से मेल खाना चाहिए। विवरण बदलें या खाता हटाएँ।';

  @override
  String get bankHintFailed =>
      'हम इस खाते को सत्यापित नहीं कर सके। विवरण जाँचकर फिर कोशिश करें।';

  @override
  String get bankErrHolderRequired => 'खाताधारक का नाम लिखें।';

  @override
  String get bankErrHolderInvalid => 'नाम में केवल अक्षर इस्तेमाल करें।';

  @override
  String get bankErrAccountRequired => 'खाता संख्या लिखें।';

  @override
  String get bankErrAccountInvalid => 'खाता संख्या में 9 से 18 अंक होते हैं।';

  @override
  String get bankErrDuplicate => 'यह खाता पहले से जुड़ा है।';

  @override
  String get bankErrConfirmRequired => 'खाता संख्या फिर से लिखें।';

  @override
  String get bankErrConfirmMismatch => 'दोनों खाता संख्याएँ मेल नहीं खातीं।';

  @override
  String get bankErrIfscRequired => 'IFSC कोड लिखें।';

  @override
  String get bankErrIfscInvalid =>
      'IFSC में 11 अक्षर होते हैं, जैसे HDFC0001234।';

  @override
  String get bankErrIfscUnknown => 'हम इस IFSC को नहीं पहचानते।';

  @override
  String get poTitle => 'पेआउट सेंटर';

  @override
  String get poTabOverview => 'अवलोकन';

  @override
  String get poTabMethods => 'तरीके';

  @override
  String get poTabVerification => 'सत्यापन';

  @override
  String get poTabHistory => 'इतिहास';

  @override
  String get poAvailable => 'निकालने के लिए उपलब्ध';

  @override
  String poPendingPaid(String pending, String paid) {
    return 'लंबित $pending · भुगतान हुआ $paid';
  }

  @override
  String poOpenTitle(String amount) {
    return '$amount का पेआउट जारी है';
  }

  @override
  String poArrival(String from, String to) {
    return 'अपेक्षित $from – $to';
  }

  @override
  String get poEligibilityTitle => 'निकासी की जाँच-सूची';

  @override
  String get poEligibilityBody => 'हर पेआउट से पहले BLOCKS ये जाँचता है।';

  @override
  String get elIdentity => 'पहचान सत्यापित';

  @override
  String get elBank => 'बैंक खाता सत्यापित';

  @override
  String elMinimum(String minimum) {
    return 'कम से कम $minimum की शेष राशि';
  }

  @override
  String get elNoHold => 'पेआउट पर कोई सुरक्षा रोक नहीं';

  @override
  String get elStanding => 'खाता अच्छी स्थिति में';

  @override
  String get poNotYet => 'अभी नहीं';

  @override
  String get poActionVerify => 'पहचान सत्यापित करें';

  @override
  String get poActionAddBank => 'बैंक जोड़ें';

  @override
  String get poActionFixBank => 'बैंक ठीक करें';

  @override
  String poHoldUntil(String date) {
    return '$date तक रुका';
  }

  @override
  String get poRulesTitle => 'पेआउट के नियम';

  @override
  String poRuleMinimum(String amount) {
    return 'न्यूनतम निकासी $amount।';
  }

  @override
  String poRuleTiming(int minDays, int maxDays) {
    return 'पैसे $minDays से $maxDays कार्य दिवसों में पहुँचते हैं।';
  }

  @override
  String poRuleStepUp(String amount) {
    return '$amount या उससे ज़्यादा की निकासी पर अतिरिक्त पुष्टि चाहिए।';
  }

  @override
  String poRuleHold(int hours) {
    return 'बैंक खाता बदलने के बाद $hours घंटे पेआउट रुके रहते हैं।';
  }

  @override
  String poBlockedBy(String reason) {
    return 'अभी तैयार नहीं: $reason';
  }

  @override
  String get poRequest => 'पेआउट का अनुरोध करें';

  @override
  String get poTaxInfo => 'कर संबंधी जानकारी';

  @override
  String get poHistoryEmpty => 'अभी कोई पेआउट नहीं';

  @override
  String get poHistoryEmptyBody => 'आपके पेआउट यहाँ दिखेंगे।';

  @override
  String get poRequested => 'अनुरोध किया';

  @override
  String get poProcessing => 'प्रोसेस हो रहा है';

  @override
  String get poCompleted => 'पूरा हुआ';

  @override
  String get poFailed => 'विफल';

  @override
  String get poReversed => 'वापस हुआ';

  @override
  String get poOnHold => 'रोका गया';

  @override
  String get poReasonBankRejected =>
      'बैंक यह भुगतान स्वीकार नहीं कर सका। पैसा आपकी शेष राशि में वापस है।';

  @override
  String get poReasonBankReturned =>
      'बैंक ने यह भुगतान लौटा दिया। पैसा आपकी शेष राशि में वापस है।';

  @override
  String get poReasonSecurityReview =>
      'सुरक्षा जाँच के लिए रोका गया। हम आपको बताएँगे।';

  @override
  String get poReasonGeneric => 'इस पेआउट में कुछ गड़बड़ हुई।';

  @override
  String poPaidOn(String date) {
    return '$date को भुगतान हुआ';
  }

  @override
  String poRequestedOn(String date) {
    return '$date को अनुरोध किया';
  }

  @override
  String poReference(String reference) {
    return 'संदर्भ $reference';
  }

  @override
  String poTileLabel(String amount, String status, String date) {
    return '$amount का पेआउट, $status, $date को अनुरोध';
  }

  @override
  String get poRequestTitle => 'पेआउट का अनुरोध करें';

  @override
  String poMinimumIs(String amount) {
    return 'न्यूनतम $amount';
  }

  @override
  String get poAmount => 'निकालने की रकम';

  @override
  String get poAll => 'सब';

  @override
  String get poSendTo => 'यहाँ भेजें';

  @override
  String get poSummaryTitle => 'सारांश';

  @override
  String get poTaxNote =>
      'BLOCKS कर की गणना नहीं करता। यदि कोई कटौती लागू होती है, तो पेआउट सेवा उसे लगाती है और आपके स्टेटमेंट पर दिखाती है।';

  @override
  String get poReview => 'पेआउट की समीक्षा करें';

  @override
  String get poConfirmTitle => 'पेआउट की पुष्टि करें';

  @override
  String get poConfirmAmount => 'रकम';

  @override
  String get poConfirmTo => 'किसे';

  @override
  String get poConfirmArrival => 'अपेक्षित आगमन';

  @override
  String get poConfirmNote =>
      'पैसा अभी आपकी शेष राशि से अलग रखा जाता है और आपके बैंक को भेजा जाता है।';

  @override
  String get poConfirmStepUp =>
      'इस रकम के लिए आपके पासवर्ड और कोड से अतिरिक्त पुष्टि चाहिए।';

  @override
  String poConfirmButton(String amount) {
    return '$amount की पुष्टि करें';
  }

  @override
  String get poNotReadyTitle => 'आप अभी नहीं निकाल सकते';

  @override
  String get poNotReadyBody => 'पहले पेआउट सेंटर में चरण पूरे करें।';

  @override
  String get poGoToCenter => 'पेआउट सेंटर खोलें';

  @override
  String get poErrBelowMinimum => 'यह न्यूनतम निकासी से कम है।';

  @override
  String get poErrExceeds => 'यह आपकी उपलब्ध शेष राशि से ज़्यादा है।';

  @override
  String get poErrNotEligible => 'आप अभी निकासी के पात्र नहीं हैं।';

  @override
  String get poErrOnHold => 'आपके हाल के बैंक बदलाव के बाद पेआउट रुके हैं।';

  @override
  String get poErrNoBank => 'पहले कोई बैंक खाता चुनें।';

  @override
  String get poErrStepUp =>
      'अतिरिक्त पुष्टि नहीं मिली या समाप्त हो गई। कृपया फिर कोशिश करें।';

  @override
  String get poSuccessTitle => 'पेआउट का अनुरोध हुआ';

  @override
  String poSuccessBody(String amount, String bank, String window) {
    return '$amount $bank को भेजा जा रहा है। अपेक्षित $window।';
  }

  @override
  String get poViewHistory => 'इतिहास देखें';

  @override
  String get suTitle => 'पुष्टि करें कि यह आप हैं';

  @override
  String get suWhyAddBank =>
      'आप पेआउट खाता जोड़ रहे हैं। पहले पुष्टि करें कि यह आप हैं।';

  @override
  String get suWhyChangeBank =>
      'आप अपना मुख्य पेआउट खाता बदल रहे हैं। पहले पुष्टि करें कि यह आप हैं।';

  @override
  String get suWhyRemoveBank =>
      'आप पेआउट खाता हटा रहे हैं। पहले पुष्टि करें कि यह आप हैं।';

  @override
  String get suWhyPayout => 'यह बड़ी निकासी है। पहले पुष्टि करें कि यह आप हैं।';

  @override
  String get suWhyTax =>
      'आप अपनी कर जानकारी बदल रहे हैं। पहले पुष्टि करें कि यह आप हैं।';

  @override
  String get suWrongPassword => 'वह पासवर्ड सही नहीं है।';

  @override
  String get suConfirm => 'पुष्टि करें';

  @override
  String get suNeverShare =>
      'BLOCKS कभी किसी संदेश या कॉल में यह कोड नहीं माँगेगा। इसे किसी से साझा न करें।';

  @override
  String get suCodeAuthenticator => 'अपने ऑथेंटिकेटर ऐप से कोड दर्ज करें।';

  @override
  String suCodeSentPhone(String destination) {
    return 'हमने $destination पर कोड भेजा है।';
  }

  @override
  String suCodeSentEmail(String destination) {
    return 'हमने $destination पर कोड भेजा है।';
  }

  @override
  String get taxTitle => 'कर संबंधी जानकारी';

  @override
  String get taxPanTitle => 'पैन';

  @override
  String get taxPanLabel => 'पैन नंबर';

  @override
  String get taxProvided => 'दिया गया';

  @override
  String get taxNotProvided => 'अभी नहीं दिया';

  @override
  String taxUpdatedOn(String date) {
    return '$date को अपडेट किया';
  }

  @override
  String get taxAdd => 'पैन जोड़ें';

  @override
  String get taxUpdate => 'पैन अपडेट करें';

  @override
  String get taxSave => 'पैन सेव करें';

  @override
  String get taxSaved => 'कर जानकारी सेव हुई';

  @override
  String get taxErrPan => 'पैन में 10 अक्षर होते हैं, जैसे ABCDE1234F।';

  @override
  String get taxNote =>
      'BLOCKS यह इसलिए लेता है ताकि पेआउट प्रदाता कर नियमों का पालन कर सके। BLOCKS ऐप में कर की गणना नहीं करता। यदि कोई कटौती लागू होती है, तो पेआउट सेवा उसे लगाती और विस्तार से दिखाती है। सेव करने के बाद नंबर छिपा हुआ दिखता है।';

  @override
  String get cdTitle => 'क्रिएटर और पेआउट';

  @override
  String get cdIntro =>
      'मॉक सर्वर को चलाएँ ताकि आप बिगड़ने वाले रास्ते भी दिखा सकें।';

  @override
  String cdStatus(String kyc, String balance, int banks, int payouts) {
    return 'पहचान: $kyc · उपलब्ध $balance · $banks बैंक खाते · $payouts खुले पेआउट';
  }

  @override
  String get cdKycOutcome => 'अगली पहचान समीक्षा का नतीजा';

  @override
  String get cdOutcomeVerified => 'सत्यापित';

  @override
  String get cdOutcomeRejected => 'अस्वीकृत';

  @override
  String get cdOutcomeAction => 'कार्रवाई ज़रूरी';

  @override
  String get cdPayoutOutcome => 'अगले पेआउट का नतीजा';

  @override
  String get cdPayCompleted => 'पूरा हुआ';

  @override
  String get cdPayFailed => 'विफल';

  @override
  String get cdPayHold => 'रोका गया';

  @override
  String get cdPayReversed => 'वापस हुआ';

  @override
  String get cdPublishOutcome => 'अगली रील का प्रकाशन';

  @override
  String get cdPubNormal => 'लाइव हो जाती है';

  @override
  String get cdPubUploadFails => 'अपलोड एक बार विफल';

  @override
  String get cdPubModeration => 'समीक्षा में अस्वीकृत';

  @override
  String get cdPubNote => 'केवल अगले प्रकाशन पर लागू होता है।';

  @override
  String get cdSafetyHold => 'बैंक बदलाव के बाद 24 घंटे पेआउट रोकें';

  @override
  String get cdSafetyHoldBody =>
      'सुरक्षा रोक दिखाता है। डिफ़ॉल्ट रूप से बंद, ताकि डेमो न रुके।';

  @override
  String get cdOpenStudio => 'क्रिएटर स्टूडियो खोलें';

  @override
  String get cdExpire => 'पहचान सत्यापन समाप्त करें';

  @override
  String get cdReset => 'क्रिएटर और पेआउट डेटा रीसेट करें';

  @override
  String get cdResetDone => 'क्रिएटर और पेआउट डेटा रीसेट हुआ';

  @override
  String get kycDob => 'जन्म तिथि';

  @override
  String kycDobHelp(int age) {
    return 'आपकी उम्र कम से कम $age वर्ष होनी चाहिए।';
  }

  @override
  String get kycErrDobRequired => 'अपनी जन्म तिथि चुनें।';

  @override
  String get kycErrDobInvalid => 'सही जन्म तिथि दर्ज करें।';

  @override
  String kycErrAge(int age) {
    return 'सत्यापन के लिए आपकी उम्र कम से कम $age वर्ष होनी चाहिए।';
  }

  @override
  String get kycBusinessType => 'व्यवसाय का प्रकार';

  @override
  String get kycErrBusinessType => 'व्यवसाय का प्रकार चुनें।';

  @override
  String get kycVerifiedOn => 'सत्यापन की तारीख';

  @override
  String get rsLanesTitle => 'टाइमलाइन पर टेक्स्ट और स्टिकर';

  @override
  String get rsLanesHint =>
      'हर बार दिखाता है कि वह स्क्रीन पर कब रहेगा। बदलने के लिए टैप करें।';

  @override
  String rsLaneText(String content, String start, String end) {
    return 'टेक्स्ट “$content”, $start से $end तक स्क्रीन पर';
  }

  @override
  String rsLaneSticker(String content, String start, String end) {
    return 'स्टिकर $content, $start से $end तक स्क्रीन पर';
  }

  @override
  String get taxAccountTitle => 'खाता';

  @override
  String get taxAccountType => 'खाते का प्रकार';

  @override
  String get taxAccountUnknown => 'अभी तय नहीं';

  @override
  String get taxDocsTitle => 'कर और पेआउट दस्तावेज़';

  @override
  String get taxDocsBody =>
      'आपके पेआउट के लिए पेआउट प्रदाता द्वारा जारी स्टेटमेंट और कर-कटौती प्रमाणपत्र (यदि लागू हों) यहाँ दिखते हैं।';

  @override
  String get taxDocsEmpty =>
      'अभी कोई दस्तावेज़ नहीं। पहला पेआउट पूरा होने के बाद वे यहाँ दिखेंगे।';

  @override
  String get taxDocStatement => 'पेआउट स्टेटमेंट';

  @override
  String get taxDocCertificate => 'कर-कटौती प्रमाणपत्र';

  @override
  String taxDocQuarter(int quarter, int year) {
    return 'तिमाही $quarter, $year';
  }

  @override
  String get taxDocReady => 'उपलब्ध';

  @override
  String get taxDocLater => 'अवधि समाप्त होने के बाद जारी, यदि लागू हो';

  @override
  String get csNavMusic => 'कॉपीराइट और संगीत';

  @override
  String get cmTitle => 'कॉपीराइट और संगीत';

  @override
  String get cmIntro =>
      'आपकी रील्स में इस्तेमाल हुए ट्रैक और ओरिजिनल ऑडियो, और क्या हर एक अब भी इस्तेमाल हो सकता है।';

  @override
  String get cmUsedTitle => 'आपकी रील्स में संगीत';

  @override
  String get cmUsedBody =>
      'ट्रैक लाइसेंस वाले, BLOCKS के अपने या क्रिएटर के अपने कैटलॉग से आते हैं।';

  @override
  String get cmEmpty =>
      'अभी आपकी रील्स में संगीत नहीं है। रील बनाते समय ट्रैक जोड़ें।';

  @override
  String get cmStatusAvailable => 'उपलब्ध';

  @override
  String get cmStatusExpiring => 'लाइसेंस जल्द समाप्त होगा';

  @override
  String get cmStatusUnavailable => 'नई रील्स के लिए उपलब्ध नहीं';

  @override
  String cmLicenceUntil(String date) {
    return 'लाइसेंस $date तक';
  }

  @override
  String get cmReasonExpired => 'इस ट्रैक का लाइसेंस समाप्त हो गया है।';

  @override
  String get cmReasonRegion =>
      'यह ट्रैक आपके देश में इस्तेमाल के लिए लाइसेंस्ड नहीं है।';

  @override
  String get cmReasonRestricted =>
      'इस ट्रैक का कोई इस्तेमाल योग्य लाइसेंस नहीं है।';

  @override
  String cmReelsUsing(int n) {
    return 'इसे इस्तेमाल करने वाली रील्स: $n';
  }

  @override
  String get cmOriginalTitle => 'आपका ओरिजिनल ऑडियो';

  @override
  String get cmOriginalBody =>
      'आपकी रील्स में रिकॉर्ड हुई आवाज़। तय करें कि दूसरे इसे दोबारा इस्तेमाल कर सकें या नहीं।';

  @override
  String get cmOriginalEmpty =>
      'अभी कोई ओरिजिनल ऑडियो नहीं। रील में आवाज़ रिकॉर्ड करें, वह यहाँ दिखेगी।';

  @override
  String get cmReuseLabel => 'दूसरे इस ऑडियो को दोबारा इस्तेमाल कर सकते हैं';

  @override
  String get cmReuseOnDone => 'अब दूसरे इस ऑडियो को इस्तेमाल कर सकते हैं';

  @override
  String get cmReuseOffDone => 'अब दूसरे इस ऑडियो को इस्तेमाल नहीं कर सकते';

  @override
  String get cmRightsNote =>
      'BLOCKS हर प्रकाशन से पहले अधिकार दोबारा जाँचता है, और लाइसेंस समाप्त होने पर उपलब्धता बदल सकती है। यह कानूनी सलाह नहीं है।';

  @override
  String get authCreateAccount => 'खाता बनाएँ';

  @override
  String get regTitle => 'अपना खाता बनाएँ';

  @override
  String get regSubtitle => 'अपने ई-मेल या फ़ोन नंबर से BLOCKS से जुड़ें।';

  @override
  String get regName => 'पूरा नाम';

  @override
  String get regUsername => 'यूज़रनेम';

  @override
  String get regUsernameHelp => '3–30 अक्षर, अंक, डॉट या अंडरस्कोर';

  @override
  String get regEmail => 'ई-मेल';

  @override
  String get regPhone => 'फ़ोन नंबर';

  @override
  String get regContactHelp =>
      'ई-मेल, फ़ोन नंबर या दोनों दें। पुष्टि के लिए हम एक कोड भेजेंगे।';

  @override
  String get regPassword => 'पासवर्ड';

  @override
  String get regDob => 'जन्म तिथि';

  @override
  String get regDobHelp =>
      'केवल यह जाँचने के लिए कि आपकी उम्र 13 या उससे अधिक है। दूसरों को कभी नहीं दिखती।';

  @override
  String get regDobChoose => 'अपनी जन्म तिथि चुनें';

  @override
  String get regButton => 'खाता बनाएँ';

  @override
  String get regHaveAccount => 'मेरा पहले से खाता है';

  @override
  String get regErrRequired => 'यह ज़रूरी है';

  @override
  String get regErrInvalid => 'यह सही नहीं लग रहा';

  @override
  String get regErrUsername =>
      '3–30 अक्षर, अंक, डॉट या अंडरस्कोर इस्तेमाल करें';

  @override
  String get regErrTaken => 'यह यूज़रनेम उपलब्ध नहीं है';

  @override
  String get regErrContact => 'ई-मेल या फ़ोन नंबर दें';

  @override
  String get regErrTooYoung =>
      'जुड़ने के लिए आपकी उम्र कम से कम 13 वर्ष होनी चाहिए';

  @override
  String get regErrPassword =>
      'ज़्यादा मज़बूत पासवर्ड चुनें (लंबा, बड़े और छोटे अक्षर, एक अंक और एक चिह्न के साथ)';

  @override
  String get cvTitle => 'अपना कोड डालें';

  @override
  String cvSentTo(String destination) {
    return 'हमने $destination पर 6 अंकों का कोड भेजा है।';
  }

  @override
  String get cvSent => 'हमने आपको 6 अंकों का कोड भेजा है।';

  @override
  String get cvApp => 'अपने ऑथेंटिकेटर ऐप का 6 अंकों का कोड डालें।';

  @override
  String get cvRecovery => 'अपने रिकवरी कोड में से कोई एक डालें।';

  @override
  String get cvRecoveryLabel => 'रिकवरी कोड';

  @override
  String get cvContactIntro =>
      'खाता बनाना पूरा करने के लिए पुष्टि करें कि यह आप हैं।';

  @override
  String get cvUnusualIntro =>
      'यह साइन-इन सामान्य से अलग लग रहा है। पुष्टि के लिए कोड डालें कि यह आप हैं।';

  @override
  String get cvButton => 'जारी रखें';

  @override
  String get cvUseApp => 'मेरा ऑथेंटिकेटर ऐप इस्तेमाल करें';

  @override
  String get cvUseSent => 'इसके बजाय भेजा गया कोड इस्तेमाल करें';

  @override
  String get cvUseRecovery => 'रिकवरी कोड इस्तेमाल करें';

  @override
  String get cvChallengeGone => 'यह चरण समाप्त हो गया है। फिर से शुरू करें।';

  @override
  String get cvLocked =>
      'बहुत ज़्यादा गलत कोड। जारी रखने के लिए नया कोड माँगें।';

  @override
  String get cvWrong => 'यह कोड सही नहीं है।';

  @override
  String get epUsernameLocked =>
      'आपका यूज़रनेम एक बार चुना जाता है और बदला नहीं जा सकता।';

  @override
  String get authSubtitleLive =>
      'खाता बनाएँ, या अपने मौजूदा खाते में साइन इन करें।';

  @override
  String get settingsLogoutBodyLive =>
      'आप कभी भी अपने यूज़रनेम और पासवर्ड से फिर साइन इन कर सकते हैं।';

  @override
  String get createPostedLive => 'आपकी पोस्ट लाइव है';

  @override
  String get createChangePhoto => 'फ़ोटो बदलें';

  @override
  String get createPhotoPreview => 'आपकी फ़ोटो का पूर्वावलोकन';

  @override
  String get createErrRestricted => 'आपका खाता अभी पोस्ट नहीं कर सकता।';

  @override
  String get createErrRateLimited =>
      'आप बहुत तेज़ी से पोस्ट कर रहे हैं। थोड़ी देर रुककर फिर कोशिश करें।';
}
