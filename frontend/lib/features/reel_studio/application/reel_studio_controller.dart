import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The tool panel shown under the preview.
enum StudioTool {
  clips,
  trim,
  music,
  text,
  stickers,
  filters,
  adjust,
  transitions,
  cover,
}

/// A one-shot message for the screen to show (snack bar). [serial] makes two
/// identical messages in a row distinct.
enum StudioNoticeKind {
  tooManyClips,
  tooManyPhotos,
  videoTooLarge,
  sliverCut,
  draftSaved,
  draftSaveFailed,
  musicUnavailable,
}

class StudioNotice extends Equatable {
  const StudioNotice(this.kind, this.serial, {this.count = 0});

  final StudioNoticeKind kind;
  final int serial;

  /// How many items the message concerns (e.g. files skipped).
  final int count;

  @override
  List<Object?> get props => [kind, serial, count];
}

/// Everything the editor shows. The edit itself is [draft]; the rest is how
/// the creator is looking at it.
class ReelStudioState extends Equatable {
  const ReelStudioState({
    required this.draft,
    required this.config,
    this.tool = StudioTool.clips,
    this.selectedClipId,
    this.selectedOverlayId,
    this.quality = MediaQuality.balanced,
    this.isLoading = true,
    this.isSaving = false,
    this.isDirty = false,
    this.lastSavedAt,
    this.notice,
    this.loadError,
  });

  final ReelDraft draft;
  final ReelConfig config;
  final StudioTool tool;
  final String? selectedClipId;
  final String? selectedOverlayId;
  final MediaQuality quality;
  final bool isLoading;
  final bool isSaving;
  final bool isDirty;
  final DateTime? lastSavedAt;
  final StudioNotice? notice;

  /// Why the studio could not open (the reel settings or the draft could not be loaded). While
  /// this is set the screen says so, instead of spinning forever.
  final Object? loadError;

  List<ReelIssue> get issues => ReelValidator.validate(draft, config);
  Duration get limit => ReelValidator.effectiveLimit(draft, config);
  bool get isOverLimit => draft.totalDuration > limit;
  bool get canContinue => !draft.isEmpty && issues.isEmpty;

  ReelClip? get selectedClip {
    for (final c in draft.clips) {
      if (c.id == selectedClipId) return c;
    }
    return null;
  }

  ReelOverlay? get selectedOverlay {
    for (final o in draft.overlays) {
      if (o.id == selectedOverlayId) return o;
    }
    return null;
  }

  MediaProfile get profile => MediaProfile.of(quality);

  OptimizationEstimate get estimate =>
      MediaOptimizer.estimateDraft(draft, profile);

  ReelStudioState copyWith({
    ReelDraft? draft,
    ReelConfig? config,
    StudioTool? tool,
    String? selectedClipId,
    bool clearClip = false,
    String? selectedOverlayId,
    bool clearOverlay = false,
    MediaQuality? quality,
    bool? isLoading,
    bool? isSaving,
    bool? isDirty,
    DateTime? lastSavedAt,
    StudioNotice? notice,
    Object? loadError,
    bool clearLoadError = false,
  }) => ReelStudioState(
    draft: draft ?? this.draft,
    config: config ?? this.config,
    tool: tool ?? this.tool,
    selectedClipId: clearClip ? null : (selectedClipId ?? this.selectedClipId),
    selectedOverlayId: clearOverlay
        ? null
        : (selectedOverlayId ?? this.selectedOverlayId),
    quality: quality ?? this.quality,
    isLoading: isLoading ?? this.isLoading,
    isSaving: isSaving ?? this.isSaving,
    isDirty: isDirty ?? this.isDirty,
    lastSavedAt: lastSavedAt ?? this.lastSavedAt,
    notice: notice ?? this.notice,
    loadError: clearLoadError ? null : (loadError ?? this.loadError),
  );

  @override
  List<Object?> get props => [
    draft,
    config,
    tool,
    selectedClipId,
    selectedOverlayId,
    quality,
    isLoading,
    isSaving,
    isDirty,
    lastSavedAt,
    notice,
    loadError,
  ];
}

/// The reel editor's brain. One session at a time: the screen calls [begin]
/// with a draft id (or null for a new reel) and the provider lives as long as
/// the editor is on screen.
///
/// Editing rules live in `ReelTimeline` / `ReelValidator` (pure, unit-tested);
/// this class only applies them to state, so the same rules hold in the mock
/// and in a real build.
class ReelStudioController extends Notifier<ReelStudioState> {
  int _seq = 0;
  int _noticeSerial = 0;

  DateTime _now() => ref.read(clockProvider)();

  String _id(String prefix) =>
      '$prefix${_now().microsecondsSinceEpoch.toRadixString(36)}${_seq++}';

  @override
  ReelStudioState build() {
    final now = _now();
    return ReelStudioState(
      draft: ReelDraft.empty(id: 'draft~pending', now: now),
      config: const ReelConfig.demo(),
      quality: MediaOptimizer.defaultProfile(
        dataSaver: ref.read(flagProvider(AppFlag.dataSaver)),
      ).quality,
    );
  }

  // --------------------------------------------------------------- session --

  /// Opens [draftId], or starts a new reel when it is null or not found.
  Future<void> begin(String? draftId) async {
    final now = _now();
    final ReelConfig config;
    try {
      config = await ref.read(creatorConfigRepositoryProvider).getReelConfig();
    } on AppFailure catch (e) {
      // Without the settings there is nothing to edit. Say so; do not leave the screen loading.
      state = state.copyWith(isLoading: false, loadError: e);
      return;
    }
    // The location comes from the profile; don't start before it has loaded.
    AppUser? user;
    try {
      user = await ref.read(currentUserProvider.future);
    } on AppFailure {
      user = null;
    }

    ReelDraft? existing;
    if (draftId != null) {
      try {
        existing = await ref.read(reelDraftRepositoryProvider).get(draftId);
      } on AppFailure catch (e) {
        state = state.copyWith(isLoading: false, loadError: e);
        return;
      }
    }
    final draft =
        existing ??
        ReelDraft.empty(id: _id('draft~'), now: now).copyWith(
          settings: ReelSettings(
            district: user?.district ?? '',
            state: user?.state ?? '',
            durationLimitSeconds: config.defaultLimitSeconds,
          ),
        );
    state = state.copyWith(
      draft: draft,
      config: config,
      isLoading: false,
      isDirty: false,
      lastSavedAt: existing?.updatedAt,
      selectedClipId: draft.clips.isEmpty ? null : draft.clips.first.id,
      clearClip: draft.clips.isEmpty,
      clearOverlay: true,
    );
  }

  /// "Try again" after the studio could not open.
  Future<void> retryBegin(String? draftId) async {
    state = state.copyWith(isLoading: true, clearLoadError: true);
    await begin(draftId);
  }

  void _edit(ReelDraft next, {String? selectClip}) {
    // Text and stickers can't outlast a reel that just got shorter.
    final overlays = ReelTimeline.fitOverlays(
      next.overlays,
      ReelTimeline.total(next.clips),
    );
    final selected = selectClip ?? state.selectedClipId;
    final stillThere = next.clips.any((c) => c.id == selected);
    state = state.copyWith(
      draft: next.copyWith(overlays: overlays),
      isDirty: true,
      selectedClipId: stillThere ? selected : null,
      clearClip: !stillThere,
      clearOverlay: !overlays.any((o) => o.id == state.selectedOverlayId),
    );
  }

  void _notify(StudioNoticeKind kind, {int count = 0}) {
    state = state.copyWith(
      notice: StudioNotice(kind, ++_noticeSerial, count: count),
    );
  }

  void selectTool(StudioTool tool) => state = state.copyWith(tool: tool);

  void selectClip(String? id) => state = id == null
      ? state.copyWith(clearClip: true)
      : state.copyWith(selectedClipId: id, clearOverlay: true);

  void selectOverlay(String? id) => state = id == null
      ? state.copyWith(clearOverlay: true)
      : state.copyWith(selectedOverlayId: id);

  // ----------------------------------------------------------------- media --

  /// Puts [assets] on the timeline, in order, skipping any that would break a
  /// hard limit (and telling the creator why).
  void addMedia(List<MediaAsset> assets) {
    var draft = state.draft;
    ReelIssueType? firstRefusal;
    var refused = 0;
    String? lastId;
    for (final a in assets) {
      final issue = ReelValidator.canAdd(draft, a, state.config);
      if (issue != null) {
        firstRefusal ??= issue;
        refused++;
        continue;
      }
      final clip = ReelTimeline.clipFromMedia(
        a,
        id: _id('c'),
        config: state.config,
      );
      draft = draft.copyWith(clips: [...draft.clips, clip]);
      lastId = clip.id;
    }
    if (lastId != null) _edit(draft, selectClip: lastId);
    if (firstRefusal != null) {
      _notify(switch (firstRefusal) {
        ReelIssueType.tooManyPhotos => StudioNoticeKind.tooManyPhotos,
        ReelIssueType.videoTooLarge => StudioNoticeKind.videoTooLarge,
        _ => StudioNoticeKind.tooManyClips,
      }, count: refused);
    }
  }

  void removeClip(String id) => _edit(
    state.draft.copyWith(clips: ReelTimeline.remove(state.draft.clips, id)),
  );

  void duplicateClip(String id) {
    if (state.draft.clips.length >= state.config.maxClips) {
      return _notify(StudioNoticeKind.tooManyClips);
    }
    final source = state.draft.clips.where((c) => c.id == id).firstOrNull;
    if (source == null) return;
    if (source.isPhoto && state.draft.photoCount >= state.config.maxPhotos) {
      return _notify(StudioNoticeKind.tooManyPhotos);
    }
    final newId = _id('c');
    _edit(
      state.draft.copyWith(
        clips: ReelTimeline.duplicate(state.draft.clips, id, newId: newId),
      ),
      selectClip: newId,
    );
  }

  void reorder(int oldIndex, int newIndex) => _edit(
    state.draft.copyWith(
      clips: ReelTimeline.reorder(state.draft.clips, oldIndex, newIndex),
    ),
  );

  void trim(String id, {Duration? start, Duration? end}) => _edit(
    state.draft.copyWith(
      clips: ReelTimeline.trim(
        state.draft.clips,
        id,
        config: state.config,
        start: start,
        end: end,
      ),
    ),
  );

  void setPhotoDuration(String id, Duration d) => _edit(
    state.draft.copyWith(
      clips: ReelTimeline.setPhotoDuration(
        state.draft.clips,
        id,
        d,
        config: state.config,
      ),
    ),
  );

  /// Cuts [id] in two at [atLocal] (time inside the clip's own playing part).
  void splitAt(String id, Duration atLocal) {
    if (state.draft.clips.length >= state.config.maxClips) {
      return _notify(StudioNoticeKind.tooManyClips);
    }
    final newId = _id('c');
    final out = ReelTimeline.split(
      state.draft.clips,
      id,
      atLocal,
      newId: newId,
      config: state.config,
    );
    if (out.length == state.draft.clips.length) {
      return _notify(StudioNoticeKind.sliverCut);
    }
    _edit(state.draft.copyWith(clips: out), selectClip: newId);
  }

  void replaceClip(String id, MediaAsset asset) {
    final issue = ReelValidator.canAdd(
      state.draft.copyWith(clips: ReelTimeline.remove(state.draft.clips, id)),
      asset,
      state.config,
    );
    if (issue == ReelIssueType.videoTooLarge) {
      return _notify(StudioNoticeKind.videoTooLarge);
    }
    if (issue == ReelIssueType.tooManyPhotos) {
      return _notify(StudioNoticeKind.tooManyPhotos);
    }
    _edit(
      state.draft.copyWith(
        clips: ReelTimeline.replace(
          state.draft.clips,
          id,
          asset,
          config: state.config,
        ),
      ),
    );
  }

  void _updateClip(String id, ReelClip Function(ReelClip) change) => _edit(
    state.draft.copyWith(
      clips: [for (final c in state.draft.clips) c.id == id ? change(c) : c],
    ),
  );

  void setClipVolume(String id, double v) =>
      _updateClip(id, (c) => c.copyWith(volume: v.clamp(0.0, 1.0)));

  /// Sets the original sound of every clip at once ("keep original sound").
  void setAllVolumes(double v) => _edit(
    state.draft.copyWith(
      clips: [
        for (final c in state.draft.clips)
          c.copyWith(volume: v.clamp(0.0, 1.0)),
      ],
    ),
  );

  void setFilter(String id, String filterId, {double? intensity}) =>
      _updateClip(
        id,
        (c) => filterId == 'original'
            ? c.copyWith(clearFilter: true, filterIntensity: 1)
            : c.copyWith(
                filterId: filterId,
                filterIntensity: intensity ?? c.filterIntensity,
              ),
      );

  void setFilterIntensity(String id, double v) =>
      _updateClip(id, (c) => c.copyWith(filterIntensity: v.clamp(0.0, 1.0)));

  /// Gives every clip the look of [id], so the whole reel feels like one.
  void applyLookToAll(String id) {
    final source = state.draft.clips.where((c) => c.id == id).firstOrNull;
    if (source == null) return;
    _edit(
      state.draft.copyWith(
        clips: [
          for (final c in state.draft.clips)
            source.filterId == null
                ? c.copyWith(clearFilter: true, adjustments: source.adjustments)
                : c.copyWith(
                    filterId: source.filterId,
                    filterIntensity: source.filterIntensity,
                    adjustments: source.adjustments,
                  ),
        ],
      ),
    );
  }

  void setAdjustments(String id, ReelAdjustments adj) =>
      _updateClip(id, (c) => c.copyWith(adjustments: adj));

  void setTransition(String id, String? transitionId) => _updateClip(
    id,
    (c) => transitionId == null || transitionId == 'none'
        ? c.copyWith(clearTransition: true)
        : c.copyWith(transitionId: transitionId),
  );

  // ----------------------------------------------------------------- music --

  void setMusic(MusicSelection? selection) => _edit(
    selection == null
        ? state.draft.copyWith(clearMusic: true)
        : state.draft.copyWith(music: selection),
  );

  void clearMusic() => setMusic(null);

  // -------------------------------------------------------------- overlays --

  /// A caption on the video. [at] is where the playhead is.
  String addText(String text, {Duration at = Duration.zero}) {
    final id = _id('o');
    final total = state.draft.totalDuration;
    final end = _overlayEnd(at, total);
    _edit(
      state.draft.copyWith(
        overlays: [
          ...state.draft.overlays,
          ReelOverlay(
            id: id,
            type: OverlayType.text,
            content: text,
            start: at,
            end: end,
            y: 0.45,
          ),
        ],
      ),
    );
    state = state.copyWith(selectedOverlayId: id);
    return id;
  }

  String addSticker(String sticker, {Duration at = Duration.zero}) {
    final id = _id('o');
    final total = state.draft.totalDuration;
    _edit(
      state.draft.copyWith(
        overlays: [
          ...state.draft.overlays,
          ReelOverlay(
            id: id,
            type: OverlayType.sticker,
            content: sticker,
            start: at,
            end: _overlayEnd(at, total),
            y: 0.55,
          ),
        ],
      ),
    );
    state = state.copyWith(selectedOverlayId: id);
    return id;
  }

  /// Visible for 3 s by default, but never past the end of the reel.
  Duration _overlayEnd(Duration start, Duration total) {
    final end = start + const Duration(seconds: 3);
    return end > total && total > start ? total : end;
  }

  void updateOverlay(String id, ReelOverlay Function(ReelOverlay) change) =>
      _edit(
        state.draft.copyWith(
          overlays: [
            for (final o in state.draft.overlays) o.id == id ? change(o) : o,
          ],
        ),
      );

  void moveOverlay(String id, double x, double y) => updateOverlay(
    id,
    (o) => o.copyWith(x: x.clamp(0.0, 1.0), y: y.clamp(0.0, 1.0)),
  );

  void transformOverlay(String id, {double? scale, double? rotation}) =>
      updateOverlay(
        id,
        (o) => o.copyWith(scale: scale?.clamp(0.4, 4.0), rotation: rotation),
      );

  /// Changes when an overlay is on screen, always inside the reel.
  void setOverlayTiming(String id, {Duration? start, Duration? end}) {
    final total = state.draft.totalDuration;
    updateOverlay(id, (o) {
      var s = start ?? o.start;
      var e = end ?? o.end;
      const minLength = Duration(milliseconds: 500);
      if (s < Duration.zero) s = Duration.zero;
      if (e > total) e = total;
      if (e - s < minLength) {
        if (start != null) {
          s = e - minLength;
        } else {
          e = s + minLength;
        }
      }
      return o.copyWith(start: s < Duration.zero ? Duration.zero : s, end: e);
    });
  }

  void setOverlayText(String id, String text) =>
      updateOverlay(id, (o) => o.copyWith(content: text));

  void setOverlayStyle(String id, OverlayTextStyle style) =>
      updateOverlay(id, (o) => o.copyWith(textStyle: style));

  void removeOverlay(String id) => _edit(
    state.draft.copyWith(
      overlays: [
        for (final o in state.draft.overlays)
          if (o.id != id) o,
      ],
    ),
  );

  // -------------------------------------------------------------- settings --

  void _settings(ReelSettings Function(ReelSettings) change) =>
      _edit(state.draft.copyWith(settings: change(state.draft.settings)));

  void setCaption(String v) => _settings((s) => s.copyWith(caption: v));

  void setLocation(String district, String stateName) =>
      _settings((s) => s.copyWith(district: district, state: stateName));

  void setAudience(PostAudience a) => _settings((s) => s.copyWith(audience: a));

  void setAllowComments({required bool value}) =>
      _settings((s) => s.copyWith(allowComments: value));

  void setAllowReuse({required bool value}) =>
      _settings((s) => s.copyWith(allowReuse: value));

  void setAllowSharing({required bool value}) =>
      _settings((s) => s.copyWith(allowSharing: value));

  void setTagged(List<String> ids) =>
      _settings((s) => s.copyWith(taggedUserIds: ids));

  void setDurationLimit(int seconds) {
    if (!state.config.selectableDurations.contains(seconds)) return;
    _settings((s) => s.copyWith(durationLimitSeconds: seconds));
  }

  void setCover({
    CoverMode? mode,
    int? frameMs,
    int? imageSeed,
    String? text,
  }) => _settings(
    (s) => s.copyWith(
      coverMode: mode,
      coverFrameMs: frameMs,
      coverImageSeed: imageSeed,
      coverText: text,
    ),
  );

  void setQuality(MediaQuality q) => state = state.copyWith(quality: q);

  // ---------------------------------------------------------------- drafts --

  /// Saves the edit. Returns whether it worked.
  Future<bool> saveDraft() async {
    if (state.draft.isEmpty) return false;
    state = state.copyWith(isSaving: true);
    try {
      await ref.read(reelDraftRepositoryProvider).save(state.draft);
      state = state.copyWith(
        isSaving: false,
        isDirty: false,
        lastSavedAt: _now(),
      );
      ref.invalidate(reelDraftsProvider);
      _notify(StudioNoticeKind.draftSaved);
      return true;
    } on AppFailure {
      state = state.copyWith(isSaving: false);
      _notify(StudioNoticeKind.draftSaveFailed);
      return false;
    }
  }

  /// Removes the draft once the reel is live.
  Future<void> discardDraft() async {
    await ref.read(reelDraftRepositoryProvider).delete(state.draft.id);
    ref.invalidate(reelDraftsProvider);
  }
}

final reelStudioProvider =
    NotifierProvider.autoDispose<ReelStudioController, ReelStudioState>(
      ReelStudioController.new,
    );
