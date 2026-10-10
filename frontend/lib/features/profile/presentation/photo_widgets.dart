import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/features/profile/application/photo_upload_controller.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Opens "Change Profile Photo": Take Photo, Choose from Gallery, Remove Photo
/// (only when there is one), Cancel.
Future<void> showChangePhotoSheet(
  BuildContext context,
  WidgetRef ref, {
  required bool hasPhoto,
}) {
  final l10n = context.l10n;
  final controller = ref.read(photoUploadControllerProvider.notifier);

  Future<void> confirmRemove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l10n.phRemoveTitle),
        content: Text(l10n.phRemoveBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(d).pop(false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(d).pop(true),
            style: TextButton.styleFrom(foregroundColor: d.scheme.error),
            child: Text(l10n.phRemove),
          ),
        ],
      ),
    );
    if (ok ?? false) await controller.remove();
  }

  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              BlocksSpacing.lg,
              0,
              BlocksSpacing.lg,
              BlocksSpacing.sm,
            ),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Semantics(
                header: true,
                child: Text(l10n.phTitle, style: context.text.titleLarge),
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text(l10n.phTake),
            onTap: () {
              Navigator.of(sheet).pop();
              controller.choose(PhotoSource.camera);
            },
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(l10n.phChoose),
            onTap: () {
              Navigator.of(sheet).pop();
              controller.choose(PhotoSource.gallery);
            },
          ),
          if (hasPhoto)
            ListTile(
              leading: Icon(
                Icons.delete_outline_rounded,
                color: sheet.scheme.error,
              ),
              title: Text(
                l10n.phRemove,
                style: TextStyle(color: sheet.scheme.error),
              ),
              onTap: () {
                Navigator.of(sheet).pop();
                confirmRemove();
              },
            ),
          ListTile(
            leading: const Icon(Icons.close_rounded),
            title: Text(l10n.cancel),
            onTap: () => Navigator.of(sheet).pop(),
          ),
        ],
      ),
    ),
  );
}

/// The profile picture with a camera badge. Tapping it opens the photo sheet;
/// while an upload runs it shows the progress on the picture itself.
class EditableAvatar extends ConsumerWidget {
  const EditableAvatar({required this.user, this.size = 84, super.key});

  final AppUser user;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final upload = ref.watch(photoUploadControllerProvider);
    final badge = size * 0.34;

    return Semantics(
      button: true,
      label: l10n.phEditSemantics,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(size * 0.32),
        onTap: upload.isUploading
            ? null
            : () => showChangePhotoSheet(
                context,
                ref,
                hasPhoto: user.avatarUrl != null,
              ),
        child: SizedBox.square(
          dimension: size,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: BlocksAvatar(
                  name: user.name,
                  imageUrl: user.avatarUrl,
                  size: size,
                  decorative: true,
                ),
              ),
              if (upload.isUploading)
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(size * 0.32),
                    ),
                    child: Center(
                      child: SizedBox.square(
                        dimension: size * 0.4,
                        child: CircularProgressIndicator(
                          value: upload.progress,
                          strokeWidth: 3,
                          color: Colors.white,
                          backgroundColor: Colors.white24,
                        ),
                      ),
                    ),
                  ),
                ),
              Positioned(
                right: -badge * 0.15,
                bottom: -badge * 0.15,
                child: Container(
                  width: badge,
                  height: badge,
                  decoration: BoxDecoration(
                    color: context.scheme.primary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: context.scheme.surface,
                      width: 2.5,
                    ),
                  ),
                  child: Icon(
                    Icons.photo_camera_rounded,
                    size: badge * 0.52,
                    color: context.scheme.onPrimary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Progress / success / error line for the photo flow. Renders nothing when
/// there is nothing to say.
class PhotoUploadStatus extends ConsumerWidget {
  const PhotoUploadStatus({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(photoUploadControllerProvider);
    final controller = ref.read(photoUploadControllerProvider.notifier);

    Widget wrap(Widget child) => Padding(
      padding: const EdgeInsets.only(bottom: BlocksSpacing.lg),
      child: child,
    );

    switch (state.phase) {
      case PhotoPhase.idle:
        return const SizedBox.shrink();

      case PhotoPhase.uploading:
        final percent = (state.progress * 100).round();
        return wrap(
          Semantics(
            liveRegion: true,
            container: true,
            label: l10n.phUploading(percent),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Text(
                    l10n.phUploading(percent),
                    style: context.text.labelLarge,
                  ),
                ),
                const SizedBox(height: BlocksSpacing.sm),
                LinearProgressIndicator(
                  value: state.progress,
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(BlocksRadius.pill),
                ),
              ],
            ),
          ),
        );

      case PhotoPhase.done:
      case PhotoPhase.removed:
        return wrap(
          _Dismissable(
            onDismiss: controller.dismiss,
            child: StatusBanner.success(
              title: state.phase == PhotoPhase.done
                  ? l10n.phDone
                  : l10n.phRemoved,
            ),
          ),
        );

      case PhotoPhase.failed:
        final message = switch (state.failure) {
          PhotoFailure.unsupported => l10n.phErrUnsupported,
          PhotoFailure.tooLarge => l10n.phErrTooLarge(
            PhotoRules.maxBytes ~/ (1024 * 1024),
          ),
          PhotoFailure.network => l10n.phErrNetwork,
          PhotoFailure.pick => l10n.phErrPick,
          _ => l10n.errorBody,
        };
        // Only a transfer problem is worth retrying with the same file.
        final canRetry =
            state.lastPhoto != null &&
            (state.failure == PhotoFailure.network ||
                state.failure == PhotoFailure.other);
        return wrap(
          _Dismissable(
            onDismiss: controller.dismiss,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                StatusBanner.error(title: message),
                if (canRetry)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: controller.retry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: Text(l10n.retry),
                    ),
                  ),
              ],
            ),
          ),
        );
    }
  }
}

class _Dismissable extends StatelessWidget {
  const _Dismissable({required this.child, required this.onDismiss});

  final Widget child;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Leave room for the close button so it never covers the message.
        Padding(
          padding: const EdgeInsetsDirectional.only(end: 40),
          child: child,
        ),
        PositionedDirectional(
          top: 0,
          end: 0,
          child: IconButton(
            tooltip: context.l10n.close,
            icon: const Icon(Icons.close_rounded, size: 18),
            onPressed: onDismiss,
          ),
        ),
      ],
    );
  }
}
