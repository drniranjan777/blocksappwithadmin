import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

Future<void> showShareSheet(BuildContext context, ContentRef content) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (sheetContext) =>
        _ShareSheet(content: content, parentContext: context),
  );
}

class _ShareSheet extends ConsumerWidget {
  const _ShareSheet({required this.content, required this.parentContext});

  final ContentRef content;
  final BuildContext parentContext;

  // Placeholder canonical link; production uses the real deep-link domain.
  static String _link(String id) => 'https://blocks.example/p/$id';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;

    Future<void> shareVia(String toast, {bool copy = false}) async {
      Navigator.of(context).pop();
      if (copy) await Clipboard.setData(ClipboardData(text: _link(content.id)));
      await ref.read(interactionsProvider.notifier).share(content);
      if (parentContext.mounted) showAppSnack(parentContext, toast);
    }

    final options = [
      (
        Icons.link_rounded,
        l10n.shareCopyLink,
        () => shareVia(l10n.linkCopied, copy: true),
      ),
      (
        Icons.add_circle_outline_rounded,
        l10n.shareToStory,
        () => shareVia(l10n.sharedToast),
      ),
      (
        Icons.send_rounded,
        l10n.shareInMessage,
        () => shareVia(l10n.sharedToast),
      ),
      (
        Icons.more_horiz_rounded,
        l10n.shareMore,
        () => shareVia(l10n.sharedToast),
      ),
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          BlocksSpacing.xl,
          0,
          BlocksSpacing.xl,
          BlocksSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.shareTitle, style: context.text.titleLarge),
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(l10n.shareSubtitle, style: context.text.bodySmall),
            const SizedBox(height: BlocksSpacing.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final (icon, label, onTap) in options)
                  Expanded(
                    child: Semantics(
                      button: true,
                      label: label,
                      excludeSemantics: true,
                      child: InkWell(
                        borderRadius: BlocksRadius.mdAll,
                        onTap: onTap,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: BlocksSpacing.sm,
                          ),
                          child: Column(
                            children: [
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  color: context.scheme.primaryContainer,
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Icon(
                                  icon,
                                  color: context.scheme.onPrimaryContainer,
                                ),
                              ),
                              const SizedBox(height: BlocksSpacing.sm),
                              Text(
                                label,
                                style: context.text.labelMedium,
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
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
