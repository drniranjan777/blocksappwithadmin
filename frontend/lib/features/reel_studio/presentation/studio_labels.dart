import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

extension StudioToolLabels on StudioTool {
  String label(AppLocalizations l) => switch (this) {
    StudioTool.clips => l.rsToolClips,
    StudioTool.trim => l.rsToolTrim,
    StudioTool.music => l.rsToolMusic,
    StudioTool.text => l.rsToolText,
    StudioTool.stickers => l.rsToolStickers,
    StudioTool.filters => l.rsToolFilters,
    StudioTool.adjust => l.rsToolAdjust,
    StudioTool.transitions => l.rsToolTransitions,
    StudioTool.cover => l.rsToolCover,
  };

  IconData get icon => switch (this) {
    StudioTool.clips => Icons.video_library_rounded,
    StudioTool.trim => Icons.content_cut_rounded,
    StudioTool.music => Icons.music_note_rounded,
    StudioTool.text => Icons.title_rounded,
    StudioTool.stickers => Icons.emoji_emotions_rounded,
    StudioTool.filters => Icons.auto_awesome_rounded,
    StudioTool.adjust => Icons.tune_rounded,
    StudioTool.transitions => Icons.swap_horiz_rounded,
    StudioTool.cover => Icons.photo_size_select_actual_rounded,
  };
}

String filterLabel(AppLocalizations l, String id) => switch (id) {
  'original' => l.fltOriginal,
  'vivid' => l.fltVivid,
  'warm' => l.fltWarm,
  'cool' => l.fltCool,
  'cinematic' => l.fltCinematic,
  'portrait' => l.fltPortrait,
  'vintage' => l.fltVintage,
  'bw' => l.fltBw,
  'golden' => l.fltGolden,
  'india' => l.fltIndia,
  'urban' => l.fltUrban,
  'food' => l.fltFood,
  'travel' => l.fltTravel,
  'night' => l.fltNight,
  _ => id,
};

/// The transitions a clip can have into the next one.
const kTransitionIds = <String>['none', 'fade', 'slide', 'zoom', 'wipe'];

String transitionLabel(AppLocalizations l, String id) => switch (id) {
  'fade' => l.trFade,
  'slide' => l.trSlide,
  'zoom' => l.trZoom,
  'wipe' => l.trWipe,
  _ => l.trNone,
};

String stickerCategoryLabel(AppLocalizations l, String id) => switch (id) {
  'emoji' => l.stkEmoji,
  'india' => l.stkIndia,
  'travel' => l.stkTravel,
  'food' => l.stkFood,
  'business' => l.stkBusiness,
  'love' => l.stkLove,
  'funny' => l.stkFunny,
  'festival' => l.stkFestival,
  'sports' => l.stkSports,
  'celebration' => l.stkCelebration,
  _ => id,
};

/// Text fonts. Platform families only (no font files shipped); a production
/// build would map these ids to licensed or open-source families.
const kFontIds = <String>['clean', 'serif', 'mono', 'display', 'script'];

String fontLabel(AppLocalizations l, String id) => switch (id) {
  'serif' => l.fontSerif,
  'mono' => l.fontMono,
  'display' => l.fontDisplay,
  'script' => l.fontScript,
  _ => l.fontClean,
};

TextStyle fontStyleOf(String id, TextStyle base) => switch (id) {
  'serif' => base.copyWith(fontFamily: 'serif'),
  'mono' => base.copyWith(fontFamily: 'monospace'),
  'display' => base.copyWith(fontWeight: FontWeight.w900, letterSpacing: 1.2),
  'script' => base.copyWith(fontFamily: 'cursive', fontStyle: FontStyle.italic),
  _ => base,
};

String animationLabel(AppLocalizations l, TextAnimation a) => switch (a) {
  TextAnimation.none => l.anNone,
  TextAnimation.fade => l.anFade,
  TextAnimation.pop => l.anPop,
  TextAnimation.slideUp => l.anSlideUp,
  TextAnimation.typewriter => l.anTypewriter,
};

/// Text colours offered in the editor (ARGB).
const kTextColors = <int>[
  0xFFFFFFFF,
  0xFF000000,
  0xFFFFC107,
  0xFFFF7A45,
  0xFFE91E63,
  0xFF3A3DD8,
  0xFF0FA39A,
  0xFF8BC34A,
];

String musicCategoryLabel(AppLocalizations l, MusicCategory c) => switch (c) {
  MusicCategory.trending => l.musTrending,
  MusicCategory.popular => l.musPopular,
  MusicCategory.newReleases => l.musNew,
  MusicCategory.hindi => l.musHindi,
  MusicCategory.telugu => l.musTelugu,
  MusicCategory.tamil => l.musTamil,
  MusicCategory.bengali => l.musBengali,
  MusicCategory.marathi => l.musMarathi,
  MusicCategory.punjabi => l.musPunjabi,
  MusicCategory.kannada => l.musKannada,
  MusicCategory.malayalam => l.musMalayalam,
  MusicCategory.instrumental => l.musInstrumental,
  MusicCategory.devotional => l.musDevotional,
  MusicCategory.travel => l.musTravel,
  MusicCategory.fitness => l.musFitness,
  MusicCategory.romantic => l.musRomantic,
  MusicCategory.comedy => l.musComedy,
};

String rightsLabel(AppLocalizations l, MusicRightsType r) => switch (r) {
  MusicRightsType.platformOwned => l.rightsPlatform,
  MusicRightsType.licensed => l.rightsLicensed,
  MusicRightsType.creatorOwned => l.rightsCreator,
  MusicRightsType.royaltyFree => l.rightsFree,
  MusicRightsType.restricted => l.rightsRestricted,
};

String qualityLabel(AppLocalizations l, MediaQuality q) => switch (q) {
  MediaQuality.dataSaver => l.qualDataSaver,
  MediaQuality.balanced => l.qualBalanced,
  MediaQuality.high => l.qualHigh,
  MediaQuality.original => l.qualOriginal,
};

String qualityHint(AppLocalizations l, MediaQuality q) => switch (q) {
  MediaQuality.dataSaver => l.qualDataSaverHint,
  MediaQuality.balanced => l.qualBalancedHint,
  MediaQuality.high => l.qualHighHint,
  MediaQuality.original => l.qualOriginalHint,
};

/// "720p", "1080p"... or "Original".
String profileResolution(AppLocalizations l, MediaProfile p) =>
    p.resolution == null ? l.qualOriginal : '${p.resolution!.shortSide}p';

String publishStageLabel(AppLocalizations l, PublishStage s) => switch (s) {
  PublishStage.preparing => l.pubPreparing,
  PublishStage.compressing => l.pubCompressing,
  PublishStage.processing => l.pubProcessing,
  PublishStage.uploading => l.pubUploading,
  PublishStage.serverProcessing => l.pubServer,
  PublishStage.moderation => l.pubModeration,
  PublishStage.published => l.pubPublished,
  PublishStage.failed => l.pubFailed,
};

String issueLabel(AppLocalizations l, ReelIssue i, ReelStudioState s) =>
    switch (i.type) {
      ReelIssueType.noClips => l.rsIssueNoClips,
      ReelIssueType.tooLong => l.rsIssueTooLong(s.limit.inSeconds),
      ReelIssueType.tooManyClips => l.rsIssueTooManyClips(s.config.maxClips),
      ReelIssueType.tooManyPhotos => l.rsIssueTooManyPhotos(s.config.maxPhotos),
      ReelIssueType.videoTooLarge => l.rsIssueVideoTooLarge(
        s.config.maxVideoSizeMb,
      ),
      ReelIssueType.clipTooShort => l.rsIssueClipTooShort,
    };

String noticeLabel(AppLocalizations l, StudioNotice n, ReelStudioState s) =>
    switch (n.kind) {
      StudioNoticeKind.tooManyClips => l.rsIssueTooManyClips(s.config.maxClips),
      StudioNoticeKind.tooManyPhotos => l.rsIssueTooManyPhotos(
        s.config.maxPhotos,
      ),
      StudioNoticeKind.videoTooLarge => l.rsIssueVideoTooLarge(
        s.config.maxVideoSizeMb,
      ),
      StudioNoticeKind.sliverCut => l.rsSliverCut,
      StudioNoticeKind.draftSaved => l.rsDraftSaved,
      StudioNoticeKind.draftSaveFailed => l.rsDraftSaveFailed,
      StudioNoticeKind.musicUnavailable => l.rsMusicUnavailable,
    };

/// "0:07" / "1:05".
String formatMinSec(Duration d) {
  final total = d.inSeconds;
  final m = total ~/ 60;
  final s = (total % 60).toString().padLeft(2, '0');
  return '$m:$s';
}

/// "4s" / "6.5s" for clip chips.
String formatShort(Duration d) {
  final ms = d.inMilliseconds;
  if (ms % 1000 == 0) return '${ms ~/ 1000}s';
  return '${(ms / 1000).toStringAsFixed(1)}s';
}
