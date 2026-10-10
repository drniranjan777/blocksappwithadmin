import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/presentation/media_picker_sheet.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panels_audio_cover.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panels_clips.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panels_look.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panels_overlay.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/overlay_lanes.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/reel_preview.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/studio_timeline.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The reel editor: preview on top, the clips in a timeline, then a strip of
/// tools (clips, trim, music, text, stickers, filters, adjust, transitions,
/// cover) with the selected tool's panel below.
class ReelStudioScreen extends ConsumerStatefulWidget {
  const ReelStudioScreen({super.key, this.draftId});

  /// Continue editing this saved draft; null starts a new reel.
  final String? draftId;

  @override
  ConsumerState<ReelStudioScreen> createState() => _ReelStudioScreenState();
}

class _ReelStudioScreenState extends ConsumerState<ReelStudioScreen>
    with SingleTickerProviderStateMixin {
  /// Where the preview is. UI-local: it changes every frame while playing, and
  /// the edit itself does not depend on it.
  final ValueNotifier<Duration> _playhead = ValueNotifier(Duration.zero);
  late final AnimationController _clock;
  bool _playing = false;

  @override
  void initState() {
    super.initState();
    _clock = AnimationController(vsync: this)..addListener(_tick);
    // Open the draft (or a fresh reel) once the first frame is up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(reelStudioProvider.notifier).begin(widget.draftId);
    });
  }

  @override
  void dispose() {
    _clock
      ..removeListener(_tick)
      ..dispose();
    _playhead.dispose();
    super.dispose();
  }

  Duration get _total => ref.read(reelStudioProvider).draft.totalDuration;

  void _tick() {
    final total = _total;
    if (total == Duration.zero) return;
    _playhead.value = Duration(
      milliseconds: (_clock.value * total.inMilliseconds).round(),
    );
  }

  void _play() {
    final total = _total;
    if (total == Duration.zero) return;
    var from = _playhead.value;
    if (from >= total - const Duration(milliseconds: 100)) from = Duration.zero;
    _clock.duration = total;
    _clock.value = from.inMilliseconds / total.inMilliseconds;
    _clock.forward().whenComplete(() {
      if (!mounted) return;
      if (_clock.isCompleted) setState(() => _playing = false);
    });
    setState(() => _playing = true);
  }

  void _pause() {
    _clock.stop();
    setState(() => _playing = false);
  }

  void _togglePlay() => _playing ? _pause() : _play();

  void _seek(Duration to) {
    final total = _total;
    final clamped = to < Duration.zero
        ? Duration.zero
        : (to > total ? total : to);
    if (_playing) _pause();
    _playhead.value = clamped;
  }

  /// Shows the clip being edited: if the playhead is somewhere else, jump to
  /// the start of [clipId] so a filter, trim or adjustment is visible at once.
  void _showClip(String clipId) {
    if (_playing) return;
    final clips = ref.read(reelStudioProvider).draft.clips;
    final i = clips.indexWhere((c) => c.id == clipId);
    if (i < 0) return;
    final starts = ReelTimeline.startOffsets(clips);
    final start = starts[i];
    final end = start + clips[i].duration;
    final at = _playhead.value;
    if (at < start || at >= end) _playhead.value = start;
  }

  /// Keeps the playhead inside the reel after an edit shortened it.
  void _clampPlayhead(Duration total) {
    if (_playhead.value > total) {
      _playhead.value = total;
      if (_playing) _pause();
    }
  }

  Future<void> _addMedia() async {
    final picked = await showMediaPicker(context);
    if (picked == null || picked.isEmpty || !mounted) return;
    ref.read(reelStudioProvider.notifier).addMedia(picked);
  }

  Future<void> _replace(String clipId) async {
    final picked = await showMediaPicker(context, single: true);
    if (picked == null || picked.isEmpty || !mounted) return;
    ref.read(reelStudioProvider.notifier).replaceClip(clipId, picked.first);
  }

  Future<void> _pickMusic() async {
    if (_playing) _pause();
    final result = await context.push<MusicSelection?>(Routes.reelMusic);
    if (!mounted || result == null) return;
    ref.read(reelStudioProvider.notifier).setMusic(result);
  }

  void _selectClip(int index) {
    final s = ref.read(reelStudioProvider);
    final clip = s.draft.clips[index];
    ref.read(reelStudioProvider.notifier).selectClip(clip.id);
    final starts = ReelTimeline.startOffsets(s.draft.clips);
    _seek(starts[index]);
  }

  Future<void> _next() async {
    final s = ref.read(reelStudioProvider);
    if (!s.canContinue) {
      showAppSnack(context, _blockerMessage(s));
      return;
    }
    if (_playing) _pause();
    await context.push(Routes.reelDetails);
  }

  String _blockerMessage(ReelStudioState s) {
    final l10n = context.l10n;
    if (s.draft.isEmpty) return l10n.rsIssueNoClips;
    return issueLabel(l10n, s.issues.first, s);
  }

  /// Leaving with unsaved work asks what to do with it.
  Future<void> _close() async {
    final s = ref.read(reelStudioProvider);
    if (!s.isDirty || s.draft.isEmpty) {
      if (mounted) context.pop();
      return;
    }
    final l10n = context.l10n;
    final choice = await showDialog<_Leave>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.rsLeaveTitle),
        content: Text(l10n.rsLeaveBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(_Leave.stay),
            child: Text(l10n.rsLeaveStay),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(_Leave.discard),
            child: Text(l10n.rsLeaveDiscard),
          ),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
            onPressed: () => Navigator.of(ctx).pop(_Leave.save),
            child: Text(l10n.rsLeaveSave),
          ),
        ],
      ),
    );
    if (!mounted || choice == null || choice == _Leave.stay) return;
    if (choice == _Leave.save) {
      await ref.read(reelStudioProvider.notifier).saveDraft();
    }
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);

    ref
      ..listen(reelStudioProvider.select((x) => x.notice), (_, notice) {
        if (notice == null) return;
        showAppSnack(
          context,
          noticeLabel(l10n, notice, ref.read(reelStudioProvider)),
        );
      })
      ..listen(reelStudioProvider.select((x) => x.draft.totalDuration), (
        _,
        total,
      ) {
        _clampPlayhead(total);
      })
      ..listen(reelStudioProvider.select((x) => x.selectedClip), (_, clip) {
        if (clip != null) _showClip(clip.id);
      });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: l10n.close,
            icon: const Icon(Icons.close_rounded),
            onPressed: _close,
          ),
          title: Text(l10n.rsTitle),
          actions: [
            IconButton(
              tooltip: l10n.rsSaveDraft,
              onPressed: s.draft.isEmpty || s.isSaving ? null : c.saveDraft,
              icon: s.isSaving
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.bookmark_add_outlined),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.only(end: BlocksSpacing.sm),
              child: Center(
                child: BlocksButton(
                  label: l10n.rsNext,
                  expand: false,
                  onPressed: s.draft.isEmpty ? null : _next,
                ),
              ),
            ),
          ],
        ),
        body: SafeArea(
          child: s.isLoading
              ? const LoadingView()
              : ResponsiveCenter(
                  maxWidth: 640,
                  child: _EditorBody(
                    state: s,
                    playhead: _playhead,
                    isPlaying: _playing,
                    onTogglePlay: _togglePlay,
                    onSeek: _seek,
                    onAddMedia: _addMedia,
                    onReplace: _replace,
                    onPickMusic: _pickMusic,
                    onSelectClip: _selectClip,
                  ),
                ),
        ),
      ),
    );
  }
}

enum _Leave { stay, discard, save }

class _EditorBody extends ConsumerWidget {
  const _EditorBody({
    required this.state,
    required this.playhead,
    required this.isPlaying,
    required this.onTogglePlay,
    required this.onSeek,
    required this.onAddMedia,
    required this.onReplace,
    required this.onPickMusic,
    required this.onSelectClip,
  });

  final ReelStudioState state;
  final ValueNotifier<Duration> playhead;
  final bool isPlaying;
  final VoidCallback onTogglePlay;
  final ValueChanged<Duration> onSeek;
  final VoidCallback onAddMedia;
  final ValueChanged<String> onReplace;
  final VoidCallback onPickMusic;
  final ValueChanged<int> onSelectClip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = ref.read(reelStudioProvider.notifier);
    final s = state;
    final media = MediaQuery.sizeOf(context);
    // The preview is as tall as the screen allows, but never more than ~45%.
    final previewHeight = (media.height * 0.42).clamp(220.0, 460.0);

    // A plain scroll view (not a lazy list): there are only a handful of
    // children, and every tool panel should always be built.
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        BlocksSpacing.xs,
        BlocksSpacing.lg,
        BlocksSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: SizedBox(
              height: previewHeight,
              child: AspectRatio(
                aspectRatio: 9 / 16,
                child: ReelPreview(
                  draft: s.draft,
                  playhead: playhead,
                  isPlaying: isPlaying,
                  onTogglePlay: onTogglePlay,
                  onSeek: onSeek,
                  selectedOverlayId: s.selectedOverlayId,
                  onSelectOverlay: c.selectOverlay,
                  onMoveOverlay: c.moveOverlay,
                  onTransformOverlay: (id, {scale, rotation}) =>
                      c.transformOverlay(id, scale: scale, rotation: rotation),
                ),
              ),
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          StudioTimeline(
            clips: s.draft.clips,
            selectedId: s.selectedClipId,
            limit: s.limit,
            onSelect: onSelectClip,
            onReorder: c.reorder,
            onAdd: onAddMedia,
          ),
          if (s.draft.overlays.isNotEmpty) ...[
            const SizedBox(height: BlocksSpacing.sm),
            OverlayLanes(
              overlays: s.draft.overlays,
              total: s.draft.totalDuration,
              selectedId: s.selectedOverlayId,
              playhead: playhead,
              onSelect: (o) {
                c
                  ..selectOverlay(o.id)
                  ..selectTool(
                    o.isText ? StudioTool.text : StudioTool.stickers,
                  );
              },
            ),
          ],
          if (s.issues.isNotEmpty && !s.draft.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: BlocksSpacing.sm),
              child: Semantics(
                liveRegion: true,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.error_outline_rounded,
                      size: 18,
                      color: context.scheme.error,
                    ),
                    const SizedBox(width: BlocksSpacing.sm),
                    Expanded(
                      child: Text(
                        issueLabel(l10n, s.issues.first, s),
                        style: context.text.bodyMedium?.copyWith(
                          color: context.scheme.error,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: BlocksSpacing.sm),
          _LengthChooser(state: s),
          const SizedBox(height: BlocksSpacing.sm),
          _ToolStrip(selected: s.tool, onSelect: c.selectTool),
          const Divider(height: BlocksSpacing.lg),
          AnimatedSwitcher(
            duration: context.reduceMotion
                ? Duration.zero
                : BlocksDurations.fast,
            child: KeyedSubtree(key: ValueKey(s.tool), child: _panel(s.tool)),
          ),
        ],
      ),
    );
  }

  Widget _panel(StudioTool tool) => switch (tool) {
    StudioTool.clips => ClipsPanel(
      playhead: playhead,
      onAddMedia: onAddMedia,
      onReplace: onReplace,
    ),
    StudioTool.trim => const TrimPanel(),
    StudioTool.music => MusicPanel(onPickMusic: onPickMusic),
    StudioTool.text => TextPanel(playhead: playhead, onSeek: onSeek),
    StudioTool.stickers => StickersPanel(playhead: playhead, onSeek: onSeek),
    StudioTool.filters => const FiltersPanel(),
    StudioTool.adjust => const AdjustPanel(),
    StudioTool.transitions => const TransitionsPanel(),
    StudioTool.cover => const CoverPanel(),
  };
}

/// "Reel length: 15 s · 30 s · 60 s · 90 s · 3 min" (the server's options).
class _LengthChooser extends ConsumerWidget {
  const _LengthChooser({required this.state});

  final ReelStudioState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = ref.read(reelStudioProvider.notifier);
    final options = state.config.selectableDurations;
    return Row(
      children: [
        Text(l10n.rsLengthLimit, style: context.text.labelLarge),
        const SizedBox(width: BlocksSpacing.sm),
        Expanded(
          child: SizedBox(
            height: BlocksSpacing.touchTarget,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final sec in options)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(
                        end: BlocksSpacing.xs,
                      ),
                      child: PanelChip(
                        label: sec >= 60 && sec % 60 == 0
                            ? l10n.rsMinutesShort(sec ~/ 60)
                            : l10n.rsSecondsShort(sec),
                        selected:
                            state.draft.settings.durationLimitSeconds == sec,
                        onTap: () => c.setDurationLimit(sec),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ToolStrip extends StatelessWidget {
  const _ToolStrip({required this.selected, required this.onSelect});

  final StudioTool selected;
  final ValueChanged<StudioTool> onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SizedBox(
      height: 64,
      // Nine fixed tools: a plain scrolling row, so all of them exist for
      // screen readers even when scrolled off screen.
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final t in StudioTool.values)
              Semantics(
                button: true,
                selected: t == selected,
                label: t.label(l10n),
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BlocksRadius.mdAll,
                  onTap: () => onSelect(t),
                  child: SizedBox(
                    width: 72,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AnimatedContainer(
                          duration: BlocksDurations.fast,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: t == selected
                                ? context.scheme.primary
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(
                              BlocksRadius.pill,
                            ),
                          ),
                          child: Icon(
                            t.icon,
                            size: 22,
                            color: t == selected
                                ? context.scheme.onPrimary
                                : context.scheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          t.label(l10n),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.labelSmall?.copyWith(
                            fontWeight: t == selected ? FontWeight.w800 : null,
                            color: t == selected
                                ? context.scheme.primary
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
