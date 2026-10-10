import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_timeline.dart';
import 'package:blocks_app/features/reel_studio/domain/reel_validator.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/clip_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Opens the gallery. Returns the chosen files **in the order they were
/// tapped**, or null if the sheet was dismissed. With [single] the first tap
/// returns at once (used to replace one clip).
Future<List<MediaAsset>?> showMediaPicker(
  BuildContext context, {
  bool single = false,
}) {
  return showModalBottomSheet<List<MediaAsset>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => MediaPickerSheet(single: single),
  );
}

enum _Filter { all, videos, photos }

class MediaPickerSheet extends ConsumerStatefulWidget {
  const MediaPickerSheet({super.key, this.single = false});

  final bool single;

  @override
  ConsumerState<MediaPickerSheet> createState() => _MediaPickerSheetState();
}

class _MediaPickerSheetState extends ConsumerState<MediaPickerSheet> {
  final List<MediaAsset> _picked = [];
  _Filter _filter = _Filter.all;
  bool _recording = false;
  String? _message;

  /// Whether adding [a] to what is already picked would break a limit.
  ReelIssueType? _blocker(MediaAsset a, ReelStudioState s) {
    final already = [
      for (final m in _picked)
        ReelTimeline.clipFromMedia(m, id: m.id, config: s.config),
    ];
    final draft = s.draft.copyWith(clips: [...s.draft.clips, ...already]);
    return ReelValidator.canAdd(draft, a, s.config);
  }

  void _toggle(MediaAsset a, ReelStudioState s) {
    final l10n = context.l10n;
    final index = _picked.indexWhere((m) => m.id == a.id);
    if (index >= 0) {
      setState(() {
        _picked.removeAt(index);
        _message = null;
      });
      return;
    }
    final issue = _blocker(a, s);
    if (issue != null) {
      setState(() {
        _message = switch (issue) {
          ReelIssueType.videoTooLarge => l10n.rsIssueVideoTooLarge(
            s.config.maxVideoSizeMb,
          ),
          ReelIssueType.tooManyPhotos => l10n.rsIssueTooManyPhotos(
            s.config.maxPhotos,
          ),
          _ => l10n.rsIssueTooManyClips(s.config.maxClips),
        };
      });
      return;
    }
    if (widget.single) {
      Navigator.of(context).pop([a]);
      return;
    }
    setState(() {
      _picked.add(a);
      _message = null;
    });
  }

  Future<void> _record() async {
    setState(() => _recording = true);
    try {
      final clip = await ref.read(mediaLibraryRepositoryProvider).record();
      ref.invalidate(mediaLibraryProvider);
      if (!mounted) return;
      final s = ref.read(reelStudioProvider);
      if (widget.single) {
        Navigator.of(context).pop([clip]);
        return;
      }
      if (_blocker(clip, s) == null) setState(() => _picked.add(clip));
    } on AppFailure {
      if (mounted) setState(() => _message = context.l10n.rsRecordFailed);
    } finally {
      if (mounted) setState(() => _recording = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final library = ref.watch(mediaLibraryProvider);
    final videos = _picked.where((m) => m.isVideo).length;
    final photos = _picked.length - videos;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          widget.single
                              ? l10n.rsReplaceTitle
                              : l10n.rsPickerTitle,
                          style: context.text.titleLarge,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: l10n.close,
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                Text(
                  widget.single ? l10n.rsReplaceBody : l10n.rsPickerBody,
                  style: context.text.bodySmall,
                ),
                const SizedBox(height: BlocksSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: SegmentedButton<_Filter>(
                        showSelectedIcon: false,
                        segments: [
                          ButtonSegment(
                            value: _Filter.all,
                            label: Text(l10n.rsFilterAll),
                          ),
                          ButtonSegment(
                            value: _Filter.videos,
                            label: Text(l10n.rsFilterVideos),
                          ),
                          ButtonSegment(
                            value: _Filter.photos,
                            label: Text(l10n.rsFilterPhotos),
                          ),
                        ],
                        selected: {_filter},
                        onSelectionChanged: (v) =>
                            setState(() => _filter = v.first),
                      ),
                    ),
                    const SizedBox(width: BlocksSpacing.sm),
                    IconButton.filledTonal(
                      tooltip: l10n.rsRecord,
                      onPressed: _recording ? null : _record,
                      icon: _recording
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                              ),
                            )
                          : const Icon(Icons.videocam_rounded),
                    ),
                  ],
                ),
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.only(top: BlocksSpacing.sm),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _message!,
                        style: context.text.bodyMedium?.copyWith(
                          color: context.scheme.error,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: BlocksSpacing.sm),
              ],
            ),
          ),
          Expanded(
            child: library.when(
              loading: () => const LoadingView(),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(mediaLibraryProvider),
              ),
              data: (all) {
                final items = [
                  for (final m in all)
                    if (_filter == _Filter.all ||
                        (_filter == _Filter.videos && m.isVideo) ||
                        (_filter == _Filter.photos && m.isPhoto))
                      m,
                ];
                if (items.isEmpty) {
                  return EmptyView(
                    icon: Icons.photo_library_outlined,
                    title: l10n.rsPickerEmpty,
                    body: l10n.rsPickerEmptyBody,
                  );
                }
                return GridView.builder(
                  controller: scroll,
                  padding: const EdgeInsets.symmetric(
                    horizontal: BlocksSpacing.lg,
                    vertical: BlocksSpacing.xs,
                  ),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                    childAspectRatio: 0.8,
                  ),
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final a = items[i];
                    final order = _picked.indexWhere((m) => m.id == a.id);
                    return _GalleryTile(
                      asset: a,
                      order: order < 0 ? null : order + 1,
                      tooLarge:
                          a.isVideo &&
                          !ReelValidator.isVideoSizeAllowed(
                            a.originalSizeBytes,
                            s.config,
                          ),
                      onTap: () => _toggle(a, s),
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              child: widget.single
                  ? const SizedBox.shrink()
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_picked.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: BlocksSpacing.sm,
                            ),
                            child: Text(
                              l10n.rsSelectedSummary(videos, photos),
                              style: context.text.labelLarge,
                            ),
                          ),
                        BlocksButton(
                          label: _picked.isEmpty
                              ? l10n.rsPickerAddNone
                              : l10n.rsPickerAdd(_picked.length),
                          icon: Icons.add_rounded,
                          onPressed: _picked.isEmpty
                              ? null
                              : () => Navigator.of(context).pop([..._picked]),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GalleryTile extends StatelessWidget {
  const _GalleryTile({
    required this.asset,
    required this.order,
    required this.tooLarge,
    required this.onTap,
  });

  final MediaAsset asset;
  final int? order;
  final bool tooLarge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selected = order != null;
    final size = MediaOptimizer.formatBytes(asset.originalSizeBytes);
    final type = asset.isVideo ? l10n.rsVideo : l10n.rsPhoto;
    final dur = asset.isVideo ? ', ${formatShort(asset.duration)}' : '';
    final label = tooLarge
        ? l10n.rsGalleryItemTooLarge(type, size)
        : '$type$dur, $size${selected ? ', ${l10n.rsSelectedN(order!)}' : ''}';

    return Semantics(
      button: true,
      selected: selected,
      enabled: !tooLarge,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: tooLarge ? null : onTap,
        child: AnimatedContainer(
          duration: BlocksDurations.fast,
          decoration: BoxDecoration(
            borderRadius: BlocksRadius.mdAll,
            border: Border.all(
              color: selected ? context.scheme.primary : Colors.transparent,
              width: 3,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(BlocksRadius.md - 3),
            child: Stack(
              fit: StackFit.expand,
              children: [
                MediaVisual(media: asset),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.6),
                      ],
                      stops: const [0.5, 1],
                    ),
                  ),
                ),
                if (tooLarge)
                  ColoredBox(color: Colors.black.withValues(alpha: 0.55)),
                PositionedDirectional(
                  start: 5,
                  bottom: 4,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        asset.isVideo
                            ? Icons.videocam_rounded
                            : Icons.photo_rounded,
                        size: 13,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        asset.isVideo ? formatShort(asset.duration) : size,
                        style: context.text.labelSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                if (asset.isVideo)
                  PositionedDirectional(
                    end: 5,
                    bottom: 4,
                    child: Text(
                      size,
                      style: context.text.labelSmall?.copyWith(
                        color: Colors.white70,
                      ),
                    ),
                  ),
                if (tooLarge)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Text(
                        l10n.rsTooLarge,
                        textAlign: TextAlign.center,
                        style: context.text.labelMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                if (selected)
                  PositionedDirectional(
                    end: 5,
                    top: 5,
                    child: Container(
                      width: 24,
                      height: 24,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: context.scheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '$order',
                        style: context.text.labelMedium?.copyWith(
                          color: context.scheme.onPrimary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
