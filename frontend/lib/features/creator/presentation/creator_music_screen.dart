import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/application/creator_providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/creator/presentation/widgets/studio_nav.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart'
    show StatusBannerInfo;
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

/// Creator Studio → Copyright and music.
///
/// Which tracks the creator has used and whether each can still be used in new
/// reels, plus their own original audio and whether others may reuse it. The
/// rights decisions are the server's; this screen only shows them.
class CreatorMusicScreen extends ConsumerWidget {
  const CreatorMusicScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(creatorMusicProvider);
    return StudioScaffold(
      section: StudioSection.music,
      title: l10n.cmTitle,
      body: data.when(
        loading: () => const LoadingView(),
        error: (_, _) =>
            ErrorView(onRetry: () => ref.invalidate(creatorMusicProvider)),
        data: (m) => ListView(
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          children: [
            Text(l10n.cmIntro, style: context.text.bodyMedium),
            const SizedBox(height: BlocksSpacing.lg),
            StudioCard(
              title: l10n.cmUsedTitle,
              subtitle: l10n.cmUsedBody,
              child: m.usage.isEmpty
                  ? Text(l10n.cmEmpty, style: context.text.bodyMedium)
                  : Column(
                      children: [for (final u in m.usage) _UsageRow(usage: u)],
                    ),
            ),
            const SizedBox(height: BlocksSpacing.lg),
            StudioCard(
              title: l10n.cmOriginalTitle,
              subtitle: l10n.cmOriginalBody,
              child: m.originals.isEmpty
                  ? Text(l10n.cmOriginalEmpty, style: context.text.bodyMedium)
                  : Column(
                      children: [
                        for (final a in m.originals) _OriginalRow(audio: a),
                      ],
                    ),
            ),
            const SizedBox(height: BlocksSpacing.lg),
            StatusBannerInfo(text: l10n.cmRightsNote),
            const SizedBox(height: BlocksSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _UsageRow extends StatelessWidget {
  const _UsageRow({required this.usage});

  final MusicUsage usage;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final t = usage.track;
    final (icon, color, label) = switch (usage.status) {
      MusicUsageStatus.available => (
        Icons.check_circle_rounded,
        context.blocks.success,
        l10n.cmStatusAvailable,
      ),
      MusicUsageStatus.expiringSoon => (
        Icons.schedule_rounded,
        context.blocks.warning,
        l10n.cmStatusExpiring,
      ),
      MusicUsageStatus.unavailable => (
        Icons.block_rounded,
        context.scheme.error,
        l10n.cmStatusUnavailable,
      ),
    };
    final detail = switch (usage.status) {
      MusicUsageStatus.expiringSoon when t.licenseExpiry != null =>
        l10n.cmLicenceUntil(DateFormat.yMMMd(locale).format(t.licenseExpiry!)),
      MusicUsageStatus.unavailable => switch (usage.reason) {
        'expired' => l10n.cmReasonExpired,
        'restricted' => l10n.cmReasonRestricted,
        _ => l10n.cmReasonRegion,
      },
      _ => rightsLabel(l10n, t.rightsType),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
      child: Semantics(
        container: true,
        label:
            '${t.title}, ${t.artist}. $label. $detail. '
            '${l10n.cmReelsUsing(usage.reelCount)}',
        excludeSemantics: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.title, style: context.text.titleSmall),
                  Text(t.artist, style: context.text.bodySmall),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    style: context.text.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(detail, style: context.text.bodySmall),
                  // Under the details, not beside them: the Hindi and Telugu
                  // wording is long.
                  Text(
                    l10n.cmReelsUsing(usage.reelCount),
                    style: context.text.labelMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OriginalRow extends ConsumerWidget {
  const _OriginalRow({required this.audio});

  final OriginalAudio audio;

  Future<void> _set(BuildContext context, WidgetRef ref, bool value) async {
    final l10n = context.l10n;
    try {
      await ref
          .read(creatorMusicRepositoryProvider)
          .setReusable(audio.id, reusable: value);
      ref.invalidate(creatorMusicProvider);
      if (context.mounted) {
        showAppSnack(context, value ? l10n.cmReuseOnDone : l10n.cmReuseOffDone);
      }
    } on AppFailure {
      if (context.mounted) showAppSnack(context, l10n.errorBody);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    // A switch tile: the row's text names the switch for a screen reader, and
    // the whole row is the touch target.
    // The card behind is a coloured box, which would hide the tile's ink; a
    // transparent Material gives it somewhere to paint.
    return Material(
      type: MaterialType.transparency,
      child: SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: audio.reusable,
        onChanged: (v) => _set(context, ref, v),
        secondary: Icon(Icons.mic_rounded, color: context.scheme.primary),
        title: Text(audio.title, style: context.text.titleSmall),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${formatMinSec(audio.duration)} · '
              '${l10n.cmReelsUsing(audio.reelsUsing)}',
              style: context.text.bodySmall,
            ),
            Text(l10n.cmReuseLabel, style: context.text.bodySmall),
          ],
        ),
      ),
    );
  }
}
