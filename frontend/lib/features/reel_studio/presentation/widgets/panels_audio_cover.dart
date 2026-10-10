import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/draft_cover.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The reel's soundtrack: a licensed track and the slice of it that plays, or
/// the clips' own sound.
class MusicPanel extends ConsumerWidget {
  const MusicPanel({required this.onPickMusic, super.key});

  final VoidCallback onPickMusic;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final music = s.draft.music;
    final volume = s.draft.clips.isEmpty
        ? 1.0
        : s.draft.clips.map((x) => x.volume).reduce((a, b) => a + b) /
              s.draft.clips.length;

    return PanelScaffold(
      children: [
        Semantics(
          container: true,
          label: music == null
              ? l10n.rsOriginalAudio
              : l10n.rsMusicSelected(music.track.title, music.track.artist),
          child: Container(
            padding: const EdgeInsets.all(BlocksSpacing.md),
            decoration: BoxDecoration(
              color: context.scheme.surface,
              borderRadius: BlocksRadius.lgAll,
              border: Border.all(color: context.scheme.outlineVariant),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: context.scheme.primaryContainer,
                    borderRadius: BlocksRadius.mdAll,
                  ),
                  child: Icon(
                    music == null
                        ? Icons.mic_rounded
                        : Icons.music_note_rounded,
                    color: context.scheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        music?.track.title ?? l10n.rsOriginalAudio,
                        style: context.text.titleSmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        music == null
                            ? l10n.rsOriginalAudioBody
                            : l10n.rsMusicClipRange(
                                music.track.artist,
                                formatMinSec(music.start),
                                formatMinSec(music.end),
                              ),
                        style: context.text.bodySmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.md),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            PanelAction(
              icon: music == null
                  ? Icons.library_music_rounded
                  : Icons.swap_horiz_rounded,
              label: music == null ? l10n.rsAddMusic : l10n.rsChangeMusic,
              onPressed: onPickMusic,
            ),
            if (music != null)
              PanelAction(
                icon: Icons.content_cut_rounded,
                label: l10n.rsEditMusicClip,
                onPressed: onPickMusic,
              ),
            if (music != null)
              PanelAction(
                icon: Icons.delete_outline_rounded,
                label: l10n.rsRemoveMusic,
                destructive: true,
                onPressed: c.clearMusic,
              ),
          ],
        ),
        const SizedBox(height: BlocksSpacing.sm),
        PanelSlider(
          label: l10n.rsOriginalSound,
          value: volume,
          onChanged: s.draft.clips.isEmpty ? null : c.setAllVolumes,
        ),
      ],
    );
  }
}

/// Choose the picture people see before they play the reel.
class CoverPanel extends ConsumerStatefulWidget {
  const CoverPanel({super.key});

  @override
  ConsumerState<CoverPanel> createState() => _CoverPanelState();
}

class _CoverPanelState extends ConsumerState<CoverPanel> {
  final _text = TextEditingController();
  bool _synced = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    if (s.draft.isEmpty) {
      return PanelScaffold(children: [PanelHint(l10n.rsClipsEmpty)]);
    }
    if (!_synced) {
      _synced = true;
      _text.text = s.draft.settings.coverText;
    }
    final settings = s.draft.settings;
    final total = s.draft.totalDuration;
    final library = ref.watch(mediaLibraryProvider).value ?? const [];
    final photos = library.where((m) => m.isPhoto).take(10).toList();

    return PanelScaffold(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Semantics(
                label: l10n.rsCoverPreview,
                child: AspectRatio(
                  aspectRatio: 9 / 16,
                  child: ClipRRect(
                    borderRadius: BlocksRadius.mdAll,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        DraftCover(draft: s.draft),
                        if (settings.coverText.isNotEmpty)
                          Align(
                            alignment: const Alignment(0, 0.6),
                            child: Padding(
                              padding: const EdgeInsets.all(6),
                              child: Text(
                                settings.coverText,
                                textAlign: TextAlign.center,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: context.text.labelLarge?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  shadows: const [
                                    Shadow(
                                      blurRadius: 6,
                                      color: Colors.black87,
                                    ),
                                  ],
                                ),
                              ),
                            ),
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
                  Wrap(
                    spacing: BlocksSpacing.sm,
                    children: [
                      PanelChip(
                        label: l10n.rsCoverFirst,
                        selected: settings.coverMode == CoverMode.firstFrame,
                        onTap: () => c.setCover(mode: CoverMode.firstFrame),
                      ),
                      PanelChip(
                        label: l10n.rsCoverFrame,
                        selected: settings.coverMode == CoverMode.frame,
                        onTap: () => c.setCover(mode: CoverMode.frame),
                      ),
                      PanelChip(
                        label: l10n.rsCoverImage,
                        selected: settings.coverMode == CoverMode.image,
                        onTap: () => c.setCover(
                          mode: CoverMode.image,
                          imageSeed:
                              settings.coverImageSeed ??
                              (photos.isEmpty
                                  ? null
                                  : demoSeedOf(
                                      photos.first.thumbnailPath ??
                                          photos.first.localPath,
                                    )),
                        ),
                      ),
                    ],
                  ),
                  if (settings.coverMode == CoverMode.frame &&
                      total > Duration.zero)
                    PanelSlider(
                      label: l10n.rsCoverAt,
                      value: settings.coverFrameMs
                          .clamp(0, total.inMilliseconds)
                          .toDouble(),
                      max: total.inMilliseconds.toDouble(),
                      valueLabel: formatMinSec(
                        Duration(milliseconds: settings.coverFrameMs),
                      ),
                      onChanged: (v) =>
                          c.setCover(mode: CoverMode.frame, frameMs: v.round()),
                    ),
                ],
              ),
            ),
          ],
        ),
        if (settings.coverMode == CoverMode.image) ...[
          PanelTitle(l10n.rsCoverPhotos),
          SizedBox(
            height: 84,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: photos.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: BlocksSpacing.sm),
              itemBuilder: (context, i) {
                final seed = demoSeedOf(
                  photos[i].thumbnailPath ?? photos[i].localPath,
                );
                final on = seed != null && seed == settings.coverImageSeed;
                return Semantics(
                  button: true,
                  selected: on,
                  label: l10n.rsCoverPhotoN(i + 1),
                  excludeSemantics: true,
                  child: GestureDetector(
                    onTap: seed == null
                        ? null
                        : () => c.setCover(
                            mode: CoverMode.image,
                            imageSeed: seed,
                          ),
                    child: Container(
                      width: 60,
                      decoration: BoxDecoration(
                        borderRadius: BlocksRadius.mdAll,
                        border: Border.all(
                          color: on
                              ? context.scheme.primary
                              : Colors.transparent,
                          width: 3,
                        ),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(
                          BlocksRadius.md - 3,
                        ),
                        child: DemoArt(seed: seed ?? 0),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
        const SizedBox(height: BlocksSpacing.sm),
        TextField(
          controller: _text,
          maxLength: 40,
          onChanged: (v) => c.setCover(text: v),
          decoration: InputDecoration(
            labelText: l10n.rsCoverText,
            hintText: l10n.rsCoverTextHint,
          ),
        ),
      ],
    );
  }
}
