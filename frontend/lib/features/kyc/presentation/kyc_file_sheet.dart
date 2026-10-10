import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Where a document picture comes from.
enum KycFileSource { camera, gallery, pdf, demoOversized }

/// Lets the creator choose a document file.
///
/// **Only metadata (name and size) comes back.** In a real build the picker
/// hands the bytes straight to the secure upload (over TLS to private,
/// encrypted storage) and nothing is kept on the device: no copy in app
/// storage, no thumbnail cache, no gallery entry. The demo returns a made-up
/// file of a believable size.
Future<KycFile?> showKycFileSheet(
  BuildContext context, {
  required String title,
}) {
  return showModalBottomSheet<KycFile>(
    context: context,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _KycFileSheet(title: title),
  );
}

KycFile demoFileFor(KycFileSource source, String stem) => switch (source) {
  KycFileSource.camera => KycFile(
    name: '${stem}_camera.jpg',
    sizeBytes: 640 * 1024,
  ),
  KycFileSource.gallery => KycFile(
    name: '${stem}_photo.jpg',
    sizeBytes: 1200 * 1024,
  ),
  KycFileSource.pdf => KycFile(name: '$stem.pdf', sizeBytes: 380 * 1024),
  KycFileSource.demoOversized => KycFile(
    name: '${stem}_scan_large.pdf',
    sizeBytes: 12 * 1024 * 1024,
  ),
};

class _KycFileSheet extends ConsumerWidget {
  const _KycFileSheet({required this.title});

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final isDemo = ref.watch(appConfigProvider).isDemo;
    // A neutral, non-identifying stem for the made-up file names.
    const stem = 'document';

    Widget tile(KycFileSource source, IconData icon, String label) => ListTile(
      minTileHeight: BlocksSpacing.touchTarget,
      leading: Icon(icon),
      title: Text(label),
      onTap: () => Navigator.of(context).pop(demoFileFor(source, stem)),
    );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: BlocksSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
              child: Semantics(
                header: true,
                child: Text(title, style: context.text.titleLarge),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlocksSpacing.lg,
                BlocksSpacing.xs,
                BlocksSpacing.lg,
                BlocksSpacing.sm,
              ),
              child: Text(l10n.kycFileNote, style: context.text.bodySmall),
            ),
            tile(
              KycFileSource.camera,
              Icons.photo_camera_rounded,
              l10n.kycFileCamera,
            ),
            tile(
              KycFileSource.gallery,
              Icons.photo_library_rounded,
              l10n.kycFileGallery,
            ),
            tile(
              KycFileSource.pdf,
              Icons.picture_as_pdf_rounded,
              l10n.kycFilePdf,
            ),
            if (isDemo)
              tile(
                KycFileSource.demoOversized,
                Icons.warning_amber_rounded,
                l10n.kycFileDemoLarge,
              ),
          ],
        ),
      ),
    );
  }
}
