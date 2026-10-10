import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/debouncer.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/features/create/presentation/widgets/create_widgets.dart';
import 'package:blocks_app/features/reel_studio/application/reel_studio_controller.dart';
import 'package:blocks_app/features/reel_studio/domain/media_optimizer.dart';
import 'package:blocks_app/features/reel_studio/presentation/studio_labels.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/draft_cover.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The last stop before publishing: caption, hashtags, place, who can see it,
/// what others may do with it, how it climbs the Reach Ladder, and how it will
/// be prepared for upload.
class ReelDetailsScreen extends ConsumerStatefulWidget {
  const ReelDetailsScreen({super.key});

  @override
  ConsumerState<ReelDetailsScreen> createState() => _ReelDetailsScreenState();
}

class _ReelDetailsScreenState extends ConsumerState<ReelDetailsScreen> {
  late final TextEditingController _caption;

  @override
  void initState() {
    super.initState();
    _caption = TextEditingController(
      text: ref.read(reelStudioProvider).draft.settings.caption,
    );
  }

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  void _addTag(String tag) {
    final current = _caption.text;
    if (current.toLowerCase().contains(tag.toLowerCase())) return;
    final next = current.isEmpty
        ? tag
        : '$current${current.endsWith(' ') ? '' : ' '}$tag';
    _caption.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: next.length),
    );
    ref.read(reelStudioProvider.notifier).setCaption(next);
  }

  Future<void> _tagPeople() async {
    final s = ref.read(reelStudioProvider);
    final picked = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _TagPeopleSheet(initial: s.draft.settings.taggedUserIds),
    );
    if (picked != null) {
      ref.read(reelStudioProvider.notifier).setTagged(picked);
    }
  }

  Future<void> _saveDraft() async {
    final ok = await ref.read(reelStudioProvider.notifier).saveDraft();
    if (!mounted || !ok) return;
    context.go(Routes.creatorDrafts);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(reelStudioProvider);
    final c = ref.read(reelStudioProvider.notifier);
    final settings = s.draft.settings;
    final tags = extractHashtags(settings.caption);
    final suggestions = <String>{
      if (settings.district.isNotEmpty)
        '#${settings.district.replaceAll(' ', '')}',
      if (settings.state.isNotEmpty) '#${settings.state.replaceAll(' ', '')}',
    };
    final tooLong =
        settings.caption.length > PostDraftValidator.maxCaptionLength;
    final canPublish = s.canContinue && !tooLong;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.rsDetailsTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 640,
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 84,
                    child: Semantics(
                      label: l10n.rsCoverPreview,
                      child: AspectRatio(
                        aspectRatio: 9 / 16,
                        child: ClipRRect(
                          borderRadius: BlocksRadius.mdAll,
                          child: DraftCover(draft: s.draft),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: BlocksSpacing.md),
                  Expanded(
                    child: TextField(
                      controller: _caption,
                      onChanged: c.setCaption,
                      minLines: 4,
                      maxLines: 8,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: l10n.createCaptionLabel,
                        hintText: l10n.createCaptionHint,
                        errorText: tooLong
                            ? l10n.createErrorCaptionTooLong
                            : null,
                        counterText:
                            '${settings.caption.length}/${PostDraftValidator.maxCaptionLength}',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.lg),
              FieldLabel(l10n.rsHashtags),
              Wrap(
                spacing: BlocksSpacing.sm,
                runSpacing: BlocksSpacing.xs,
                children: [
                  for (final t in tags)
                    Chip(
                      avatar: const Icon(Icons.tag_rounded, size: 16),
                      label: Text(t.substring(1)),
                    ),
                  for (final t in suggestions)
                    if (!tags.any((x) => x.toLowerCase() == t.toLowerCase()))
                      ActionChip(
                        avatar: const Icon(Icons.add_rounded, size: 16),
                        label: Text(t),
                        onPressed: () => _addTag(t),
                      ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.xl),
              LocationField(
                district: settings.district,
                state: settings.state,
                onChanged: (d) => c.setLocation(d.name, d.state),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              FieldLabel(l10n.rsTagPeople),
              Material(
                color: context.scheme.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BlocksRadius.lgAll,
                  side: BorderSide(color: context.scheme.outlineVariant),
                ),
                child: ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BlocksRadius.lgAll,
                  ),
                  leading: Icon(
                    Icons.person_add_alt_1_rounded,
                    color: context.scheme.primary,
                  ),
                  title: Text(
                    settings.taggedUserIds.isEmpty
                        ? l10n.rsTagNobody
                        : l10n.rsTaggedCount(settings.taggedUserIds.length),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: _tagPeople,
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              AudiencePicker(
                value: settings.audience,
                onChanged: c.setAudience,
              ),
              const SizedBox(height: BlocksSpacing.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: settings.allowComments,
                onChanged: (v) => c.setAllowComments(value: v),
                title: Text(l10n.rsAllowComments),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: settings.allowReuse,
                onChanged: (v) => c.setAllowReuse(value: v),
                title: Text(l10n.rsAllowRemix),
                subtitle: Text(l10n.rsAllowRemixBody),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: settings.allowSharing,
                onChanged: (v) => c.setAllowSharing(value: v),
                title: Text(l10n.rsAllowSharing),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              ReachStartCard(district: settings.district),
              const SizedBox(height: BlocksSpacing.xl),
              _QualityCard(state: s),
              const SizedBox(height: BlocksSpacing.xl),
              if (!canPublish && !s.draft.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      tooLong
                          ? l10n.createErrorCaptionTooLong
                          : issueLabel(l10n, s.issues.first, s),
                      style: context.text.bodyMedium?.copyWith(
                        color: context.scheme.error,
                      ),
                    ),
                  ),
                ),
              BlocksButton(
                label: l10n.rsPublish,
                icon: Icons.rocket_launch_rounded,
                onPressed: canPublish
                    ? () => context.push(Routes.reelPublishing)
                    : null,
              ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.rsSaveDraft,
                icon: Icons.bookmark_add_outlined,
                variant: BlocksButtonVariant.tonal,
                onPressed: s.draft.isEmpty ? null : _saveDraft,
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

/// Upload quality, the size it comes to, and Data Saver.
class _QualityCard extends ConsumerWidget {
  const _QualityCard({required this.state});

  final ReelStudioState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final c = ref.read(reelStudioProvider.notifier);
    final dataSaver = ref.watch(flagProvider(AppFlag.dataSaver));
    final est = state.estimate;
    final profile = state.profile;

    // A Material (not a coloured box) so the list tiles inside can paint ink.
    return Material(
      color: context.scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BlocksRadius.xlAll,
        side: BorderSide(color: context.scheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BlocksSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.compress_rounded, color: context.scheme.primary),
                const SizedBox(width: BlocksSpacing.sm),
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      l10n.rsQualityTitle,
                      style: context.text.titleMedium,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(l10n.rsQualityBody, style: context.text.bodySmall),
            const SizedBox(height: BlocksSpacing.md),
            RadioGroup<MediaQuality>(
              groupValue: state.quality,
              onChanged: (q) {
                if (q != null) c.setQuality(q);
              },
              child: Column(
                children: [
                  for (final q in MediaQuality.values)
                    RadioListTile<MediaQuality>(
                      contentPadding: EdgeInsets.zero,
                      value: q,
                      title: Text(
                        '${qualityLabel(l10n, q)} · ${profileResolution(l10n, MediaProfile.of(q))}',
                      ),
                      subtitle: Text(qualityHint(l10n, q)),
                    ),
                ],
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: dataSaver,
              onChanged: (v) {
                ref
                    .read(appSettingsProvider.notifier)
                    .setFlag(AppFlag.dataSaver, value: v);
                c.setQuality(
                  MediaOptimizer.defaultProfile(dataSaver: v).quality,
                );
              },
              title: Text(l10n.prefDataSaver),
              subtitle: Text(l10n.prefDataSaverBody),
            ),
            const Divider(),
            Semantics(
              container: true,
              label: l10n.rsSizeSummary(
                MediaOptimizer.formatBytes(est.originalBytes),
                MediaOptimizer.formatBytes(est.optimizedBytes),
                est.reductionPercent,
              ),
              child: ExcludeSemantics(
                child: Row(
                  children: [
                    Expanded(
                      child: _SizeFigure(
                        label: l10n.rsSizeOriginal,
                        value: MediaOptimizer.formatBytes(est.originalBytes),
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward_rounded,
                      color: context.scheme.outline,
                    ),
                    Expanded(
                      child: _SizeFigure(
                        label: l10n.rsSizeOptimized,
                        value: MediaOptimizer.formatBytes(est.optimizedBytes),
                        emphasis: true,
                      ),
                    ),
                    Expanded(
                      child: _SizeFigure(
                        label: l10n.rsSizeSaved,
                        value: '${est.reductionPercent}%',
                        color: context.blocks.success,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Text(
              profile.isOriginal
                  ? l10n.rsQualityNoteOriginal
                  : l10n.rsQualityNote(profileResolution(l10n, profile)),
              style: context.text.bodySmall,
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.shield_outlined,
                  size: 14,
                  color: context.scheme.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(l10n.rsServerNote, style: context.text.bodySmall),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SizeFigure extends StatelessWidget {
  const _SizeFigure({
    required this.label,
    required this.value,
    this.emphasis = false,
    this.color,
  });

  final String label;
  final String value;
  final bool emphasis;
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          value,
          style: (emphasis ? context.text.titleLarge : context.text.titleMedium)
              ?.copyWith(
                color: color ?? (emphasis ? context.scheme.primary : null),
              ),
        ),
      ),
      Text(label, style: context.text.labelSmall, textAlign: TextAlign.center),
    ],
  );
}

/// Search the people you can tag.
class _TagPeopleSheet extends ConsumerStatefulWidget {
  const _TagPeopleSheet({required this.initial});

  final List<String> initial;

  @override
  ConsumerState<_TagPeopleSheet> createState() => _TagPeopleSheetState();
}

class _TagPeopleSheetState extends ConsumerState<_TagPeopleSheet> {
  late final Set<String> _picked = {...widget.initial};
  final _debounce = Debouncer(delay: const Duration(milliseconds: 250));
  List<UserSummary> _results = const [];
  bool _loading = true;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _debounce.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    _query = q;
    setState(() => _loading = true);
    final users = await ref
        .read(userRepositoryProvider)
        .searchUsers(q, limit: 20);
    if (!mounted || q != _query) return;
    setState(() {
      _results = users;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scroll) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              child: TextField(
                onChanged: (v) => _debounce.run(() => _search(v)),
                decoration: InputDecoration(
                  hintText: l10n.rsTagSearchHint,
                  prefixIcon: const Icon(Icons.search_rounded),
                ),
              ),
            ),
            Expanded(
              child: _loading
                  ? const LoadingView()
                  : ListView.builder(
                      controller: scroll,
                      itemCount: _results.length,
                      itemBuilder: (context, i) {
                        final u = _results[i];
                        final on = _picked.contains(u.id);
                        return CheckboxListTile(
                          value: on,
                          title: Text(u.name),
                          subtitle: Text(u.username),
                          onChanged: (v) => setState(() {
                            if (v ?? false) {
                              _picked.add(u.id);
                            } else {
                              _picked.remove(u.id);
                            }
                          }),
                        );
                      },
                    ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(BlocksSpacing.lg),
                child: BlocksButton(
                  label: l10n.rsTagDone(_picked.length),
                  onPressed: () => Navigator.of(context).pop(_picked.toList()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
