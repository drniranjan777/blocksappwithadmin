import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/constants/demo_media.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/create/application/create_controllers.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/features/create/presentation/create_labels.dart';
import 'package:blocks_app/features/create/presentation/widgets/create_widgets.dart';
import 'package:blocks_app/features/explore/application/explore_controllers.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class CreatePostScreen extends ConsumerStatefulWidget {
  const CreatePostScreen({super.key});

  @override
  ConsumerState<CreatePostScreen> createState() => _CreatePostScreenState();
}

String _submitErrorTitle(AppLocalizations l10n, PostSubmitError e) =>
    switch (e) {
      PostSubmitError.restricted => l10n.createErrRestricted,
      PostSubmitError.rateLimited => l10n.createErrRateLimited,
      PostSubmitError.photoTooLarge => l10n.phErrTooLarge(5),
      PostSubmitError.photoUnsupported => l10n.phErrUnsupported,
      PostSubmitError.network || PostSubmitError.other => l10n.errorTitle,
    };

String? _submitErrorBody(AppLocalizations l10n, PostSubmitError e) =>
    switch (e) {
      PostSubmitError.network || PostSubmitError.other => l10n.errorBody,
      _ => null,
    };

class _ErrorList extends StatelessWidget {
  const _ErrorList({required this.errors});

  final List<PostDraftError> errors;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: context.scheme.error.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(BlocksRadius.md),
          border: Border.all(
            color: context.scheme.error.withValues(alpha: 0.4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final e in errors)
              Row(
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
                      e.message(l10n),
                      style: context.text.bodyMedium?.copyWith(
                        color: context.scheme.error,
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _CreatePostScreenState extends ConsumerState<CreatePostScreen> {
  final _caption = TextEditingController();

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _publish() async {
    final l10n = context.l10n;
    final live = !ref.read(appConfigProvider).useMockData;
    final ok = await ref.read(createPostControllerProvider.notifier).submit();
    if (!mounted || !ok) return;
    final district = ref.read(createPostControllerProvider).district;
    showAppSnack(
      context,
      live ? l10n.createPostedLive : l10n.createPosted(district),
    );
    context.go(Routes.home);
  }

  /// Opens the camera or the device gallery (live service only).
  Future<void> _pickPhoto(PhotoSource source) async {
    final l10n = context.l10n;
    try {
      final photo = await ref.read(profilePhotoPickerProvider).pick(source);
      if (photo != null && mounted) {
        ref.read(createPostControllerProvider.notifier).setPhoto(photo);
      }
    } on PhotoPickFailure {
      if (mounted) showAppSnack(context, l10n.phErrPick);
    }
  }

  void _addHashtag(String tag) {
    final text = _caption.text;
    final sep = text.isEmpty || text.endsWith(' ') || text.endsWith('\n')
        ? ''
        : ' ';
    _caption.text = '$text$sep$tag ';
    _caption.selection = TextSelection.collapsed(offset: _caption.text.length);
    ref.read(createPostControllerProvider.notifier).setCaption(_caption.text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(createPostControllerProvider);
    final c = ref.read(createPostControllerProvider.notifier);
    final trending =
        ref.watch(trendingProvider(ExploreScope.district)).value ?? const [];
    final tags = trending
        .take(5)
        .map((t) => '#${t.title.replaceAll(RegExp(r'\s+'), '')}')
        .toList();
    final tooLong =
        s.caption.trim().length > PostDraftValidator.maxCaptionLength;
    // The live service takes the post's place from the author's profile and the
    // picture from the device; the demo has a built-in gallery and a picker.
    final live = !ref.watch(appConfigProvider).useMockData;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.createPostTitle),
        leading: IconButton(
          tooltip: l10n.close,
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: BlocksSpacing.md),
            child: Center(
              child: BlocksButton(
                label: l10n.createPublish,
                expand: false,
                isLoading: s.isSubmitting,
                onPressed: _publish,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              // Errors lead the form so they are visible whichever "Post"
              // button (app bar or bottom) the user pressed.
              if (s.showErrors && s.errors.isNotEmpty) ...[
                _ErrorList(errors: s.errors),
                const SizedBox(height: BlocksSpacing.lg),
              ],
              if (s.submitError != null) ...[
                StatusBanner.error(
                  title: _submitErrorTitle(l10n, s.submitError!),
                  body: _submitErrorBody(l10n, s.submitError!),
                ),
                const SizedBox(height: BlocksSpacing.lg),
              ],
              Wrap(
                spacing: BlocksSpacing.sm,
                children: [
                  BlocksChip(
                    label: l10n.createTypePhoto,
                    icon: Icons.image_rounded,
                    selected: s.type == PostType.image,
                    onSelected: () => c.setType(PostType.image),
                  ),
                  BlocksChip(
                    label: l10n.createTypeText,
                    icon: Icons.text_fields_rounded,
                    selected: s.type == PostType.text,
                    onSelected: () => c.setType(PostType.text),
                  ),
                ],
              ),
              const SizedBox(height: BlocksSpacing.lg),
              if (s.type != PostType.text && live) ...[
                FieldLabel(l10n.createPickPhoto),
                if (s.photo != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(BlocksRadius.lg),
                    child: AspectRatio(
                      aspectRatio: 4 / 3,
                      child: Image.memory(
                        s.photo!.bytes,
                        fit: BoxFit.cover,
                        // Decode no larger than the screen needs.
                        cacheWidth: 1080,
                        gaplessPlayback: true,
                        semanticLabel: l10n.createPhotoPreview,
                      ),
                    ),
                  ),
                  const SizedBox(height: BlocksSpacing.md),
                ],
                Wrap(
                  spacing: BlocksSpacing.sm,
                  runSpacing: BlocksSpacing.sm,
                  children: [
                    BlocksChip(
                      label: s.photo == null
                          ? l10n.phChoose
                          : l10n.createChangePhoto,
                      icon: Icons.photo_library_rounded,
                      selected: false,
                      onSelected: () => _pickPhoto(PhotoSource.gallery),
                    ),
                    BlocksChip(
                      label: l10n.phTake,
                      icon: Icons.photo_camera_rounded,
                      selected: false,
                      onSelected: () => _pickPhoto(PhotoSource.camera),
                    ),
                  ],
                ),
                const SizedBox(height: BlocksSpacing.lg),
              ],
              if (s.type != PostType.text && !live) ...[
                FieldLabel(l10n.createPickPhoto),
                DemoMediaGrid(
                  seeds: kDemoPhotoSeeds,
                  selected: s.mediaSeed,
                  onSelected: c.selectMedia,
                ),
                const SizedBox(height: BlocksSpacing.xs + 2),
                Text(l10n.createGalleryNote, style: context.text.bodySmall),
                if (s.mediaSeed != null) ...[
                  const SizedBox(height: BlocksSpacing.lg),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(BlocksRadius.lg),
                    child: AspectRatio(
                      aspectRatio: 4 / 3,
                      child: DemoArt(seed: s.mediaSeed!),
                    ),
                  ),
                ],
                const SizedBox(height: BlocksSpacing.lg),
              ],
              FieldLabel(l10n.createCaptionLabel),
              TextField(
                controller: _caption,
                onChanged: c.setCaption,
                minLines: 3,
                maxLines: 8,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(hintText: l10n.createCaptionHint),
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '${s.caption.trim().length}/${PostDraftValidator.maxCaptionLength}',
                    style: context.text.bodySmall?.copyWith(
                      color: tooLong ? context.scheme.error : null,
                    ),
                  ),
                ),
              ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: BlocksSpacing.md),
                FieldLabel(l10n.createHashtags),
                Wrap(
                  spacing: BlocksSpacing.sm,
                  runSpacing: BlocksSpacing.sm,
                  children: [
                    for (final t in tags)
                      BlocksChip(
                        label: t,
                        selected: false,
                        onSelected: () => _addHashtag(t),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: BlocksSpacing.xl),
              if (!live) ...[
                LocationField(
                  district: s.district,
                  state: s.state,
                  onChanged: c.setLocation,
                ),
                const SizedBox(height: BlocksSpacing.xl),
              ],
              AudiencePicker(value: s.audience, onChanged: c.setAudience),
              const SizedBox(height: BlocksSpacing.xl),
              if (s.district.isNotEmpty) ...[
                ReachStartCard(district: s.district),
                const SizedBox(height: BlocksSpacing.xl),
              ],
              BlocksButton(
                label: s.isSubmitting
                    ? l10n.createPublishing
                    : l10n.createPublish,
                isLoading: s.isSubmitting,
                onPressed: _publish,
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
