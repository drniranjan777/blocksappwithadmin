import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/utils/number_format.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/features/reel_studio/application/music_picker_controller.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/application/studio_sound.dart';
import 'package:blocks_app/features/reel_studio/presentation/music_clip_sheet.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The BLOCKS music library: search, 17 categories, what is trending (with how
/// many reels use each track), preview, and pick the slice that plays.
///
/// Returns the chosen [MusicSelection] to the editor. Every track shown has
/// already passed the server's rights check.
class MusicPickerScreen extends ConsumerStatefulWidget {
  const MusicPickerScreen({super.key});

  @override
  ConsumerState<MusicPickerScreen> createState() => _MusicPickerScreenState();
}

class _MusicPickerScreenState extends ConsumerState<MusicPickerScreen> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  final _debounce = Debouncer(delay: const Duration(milliseconds: 250));
  ReelSoundChannel? _channel;
  String? _previewId;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 240) {
        ref.read(musicPickerProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce.dispose();
    _channel?.dispose();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _togglePreview(MusicTrack t) {
    final engine = ref.read(studioSoundEngineProvider);
    _channel?.dispose();
    if (_previewId == t.id) {
      _channel = null;
      setState(() => _previewId = null);
      return;
    }
    _channel = engine.channelFor(t.previewSeed)
      ..muted = false
      ..play();
    setState(() => _previewId = t.id);
  }

  void _stopPreview() {
    _channel?.dispose();
    _channel = null;
    if (_previewId != null) setState(() => _previewId = null);
  }

  Future<void> _choose(MusicTrack t) async {
    _stopPreview();
    final studio = ref.read(reelStudioProvider);
    final picked = await showMusicClipSheet(
      context,
      track: t,
      reel: studio.draft.totalDuration,
      current: studio.draft.music,
    );
    if (!mounted || picked == null) return;
    context.pop(picked);
  }

  void _useOriginal() {
    _stopPreview();
    ref.read(reelStudioProvider.notifier).clearMusic();
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(musicPickerProvider);
    final c = ref.read(musicPickerProvider.notifier);
    final current = ref.watch(reelStudioProvider.select((x) => x.draft.music));

    final rows = <Widget>[
      _OriginalAudioTile(selected: current == null, onTap: _useOriginal),
      if (s.showsTrending && s.trending.isNotEmpty) ...[
        _Heading(l10n.rsTrendingNow),
        for (final t in s.trending)
          _TrackTile(
            track: t,
            selected: current?.track.id == t.id,
            previewing: _previewId == t.id,
            onPreview: () => _togglePreview(t),
            onUse: () => _choose(t),
          ),
        _Heading(l10n.rsAllMusic),
      ],
      if (!s.isLoading && s.tracks.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.xxl),
          child: EmptyView(
            icon: Icons.music_off_rounded,
            title: l10n.rsMusicEmpty,
            body: l10n.rsMusicEmptyBody,
          ),
        ),
      for (final t in s.tracks)
        _TrackTile(
          track: t,
          selected: current?.track.id == t.id,
          previewing: _previewId == t.id,
          onPreview: () => _togglePreview(t),
          onUse: () => _choose(t),
        ),
      if (s.isLoadingMore)
        const Padding(
          padding: EdgeInsets.all(BlocksSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.rsMusicTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 640,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BlocksSpacing.lg,
                  BlocksSpacing.sm,
                  BlocksSpacing.lg,
                  BlocksSpacing.xs,
                ),
                child: TextField(
                  controller: _search,
                  textInputAction: TextInputAction.search,
                  onChanged: (v) => _debounce.run(() => c.setQuery(v)),
                  onSubmitted: c.setQuery,
                  decoration: InputDecoration(
                    hintText: l10n.rsMusicSearchHint,
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: l10n.rsClearSearch,
                            icon: const Icon(Icons.close_rounded),
                            onPressed: () {
                              _search.clear();
                              c.setQuery('');
                              setState(() {});
                            },
                          ),
                  ),
                ),
              ),
              SizedBox(
                height: BlocksSpacing.touchTarget,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: BlocksSpacing.lg,
                  ),
                  child: Row(
                    children: [
                      Padding(
                        padding: const EdgeInsetsDirectional.only(
                          end: BlocksSpacing.xs,
                        ),
                        child: PanelChip(
                          label: l10n.rsAllMusic,
                          selected: s.category == null,
                          onTap: () => c.setCategory(null),
                        ),
                      ),
                      for (final cat in MusicCategory.values)
                        Padding(
                          padding: const EdgeInsetsDirectional.only(
                            end: BlocksSpacing.xs,
                          ),
                          child: PanelChip(
                            label: musicCategoryLabel(l10n, cat),
                            selected: s.category == cat,
                            onTap: () => c.setCategory(cat),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BlocksSpacing.lg,
                  vertical: BlocksSpacing.xs,
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.verified_user_outlined,
                      size: 14,
                      color: context.scheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        l10n.rsMusicRightsNote,
                        style: context.text.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: s.isLoading && s.tracks.isEmpty
                    ? const LoadingView()
                    : s.hasError && s.tracks.isEmpty
                    ? ErrorView(onRetry: c.retry)
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.only(
                          bottom: BlocksSpacing.xl,
                        ),
                        itemCount: rows.length,
                        itemBuilder: (_, i) => rows[i],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      BlocksSpacing.lg,
      BlocksSpacing.lg,
      BlocksSpacing.lg,
      BlocksSpacing.xs,
    ),
    child: Semantics(
      header: true,
      child: Text(text, style: context.text.titleMedium),
    ),
  );
}

class _OriginalAudioTile extends StatelessWidget {
  const _OriginalAudioTile({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      button: true,
      selected: selected,
      label: '${l10n.rsOriginalAudio}. ${l10n.rsOriginalAudioBody}',
      excludeSemantics: true,
      child: ListTile(
        minVerticalPadding: BlocksSpacing.md,
        leading: Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: context.scheme.primaryContainer,
            borderRadius: BlocksRadius.mdAll,
          ),
          child: Icon(
            Icons.mic_rounded,
            color: context.scheme.onPrimaryContainer,
          ),
        ),
        title: Text(l10n.rsOriginalAudio),
        subtitle: Text(l10n.rsOriginalAudioBody),
        trailing: selected
            ? Icon(Icons.check_circle_rounded, color: context.scheme.primary)
            : null,
        onTap: onTap,
      ),
    );
  }
}

class _TrackTile extends StatelessWidget {
  const _TrackTile({
    required this.track,
    required this.selected,
    required this.previewing,
    required this.onPreview,
    required this.onUse,
  });

  final MusicTrack track;
  final bool selected;
  final bool previewing;
  final VoidCallback onPreview;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final minutes = track.duration.inMinutes;
    final seconds = (track.duration.inSeconds % 60).toString().padLeft(2, '0');
    final meta = '${track.artist} · ${track.language} · $minutes:$seconds';
    final reels = track.reelsCount > 0
        ? l10n.rsReelsUsing(compactCount(track.reelsCount))
        : null;

    return MergeSemantics(
      child: Semantics(
        button: true,
        selected: selected,
        label: l10n.rsTrackLabel(track.title, meta),
        child: InkWell(
          onTap: onUse,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BlocksSpacing.lg,
              vertical: BlocksSpacing.sm,
            ),
            child: Row(
              children: [
                Semantics(
                  button: true,
                  label: previewing
                      ? l10n.rsStopPreviewOf(track.title)
                      : l10n.rsPreviewOf(track.title),
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: BlocksRadius.mdAll,
                    onTap: onPreview,
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: ClipRRect(
                        borderRadius: BlocksRadius.mdAll,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            DemoArt(seed: track.previewSeed),
                            ColoredBox(
                              color: Colors.black.withValues(alpha: 0.28),
                            ),
                            Icon(
                              previewing
                                  ? Icons.pause_rounded
                                  : Icons.play_arrow_rounded,
                              color: Colors.white,
                              size: 30,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.titleSmall,
                      ),
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.bodySmall,
                      ),
                      const SizedBox(height: 2),
                      Wrap(
                        spacing: BlocksSpacing.sm,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _RightsBadge(type: track.rightsType),
                          if (reels != null)
                            Text(reels, style: context.text.labelSmall),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: BlocksSpacing.sm),
                selected
                    ? Icon(
                        Icons.check_circle_rounded,
                        color: context.scheme.primary,
                      )
                    : const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RightsBadge extends StatelessWidget {
  const _RightsBadge({required this.type});

  final MusicRightsType type;

  @override
  Widget build(BuildContext context) {
    final color = context.blocks.success;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(BlocksRadius.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.verified_rounded, size: 12, color: color),
            const SizedBox(width: 3),
            Flexible(
              child: Text(
                rightsLabel(context.l10n, type),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.text.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
