import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/features/safety/application/safety_actions.dart';
import 'package:blocks_app/features/safety/presentation/report_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The "more" menu for a post or reel: report, mute, restrict, block.
/// For the user's own content only "Promote" is offered.
Future<void> showContentActionsSheet(
  BuildContext context, {
  required UserSummary author,
  required String contentId,
  required ReportTargetType targetType,
  required bool isOwn,
}) {
  return showModalBottomSheet<void>(
    context: context,
    builder: (sheetContext) => _ContentActions(
      parentContext: context,
      author: author,
      contentId: contentId,
      targetType: targetType,
      isOwn: isOwn,
    ),
  );
}

class _ContentActions extends ConsumerWidget {
  const _ContentActions({
    required this.parentContext,
    required this.author,
    required this.contentId,
    required this.targetType,
    required this.isOwn,
  });

  final BuildContext parentContext;
  final UserSummary author;
  final String contentId;
  final ReportTargetType targetType;
  final bool isOwn;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final actions = ref.read(safetyActionsProvider);

    Future<void> run(Future<void> Function() action, String message) async {
      Navigator.of(context).pop();
      await action();
      if (parentContext.mounted) showAppSnack(parentContext, message);
    }

    Future<void> confirmBlock() async {
      Navigator.of(context).pop();
      final ok = await showDialog<bool>(
        context: parentContext,
        builder: (d) => AlertDialog(
          title: Text(l10n.confirmBlockTitle(author.username)),
          content: Text(l10n.confirmBlockBody),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(d).pop(false),
              child: Text(l10n.cancel),
            ),
            TextButton(
              onPressed: () => Navigator.of(d).pop(true),
              style: TextButton.styleFrom(foregroundColor: d.scheme.error),
              child: Text(l10n.actionBlock(author.username)),
            ),
          ],
        ),
      );
      if (ok ?? false) {
        await actions.block(author.id);
        if (parentContext.mounted) {
          showAppSnack(parentContext, l10n.blockedToast(author.username));
        }
      }
    }

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isOwn)
            ListTile(
              leading: const Icon(Icons.campaign_rounded),
              title: Text(l10n.promoteTitle),
              onTap: () {
                Navigator.of(context).pop();
                parentContext.push('${Routes.promote}?postId=$contentId');
              },
            )
          else ...[
            ListTile(
              leading: Icon(Icons.flag_outlined, color: context.scheme.error),
              title: Text(l10n.actionReport),
              onTap: () {
                Navigator.of(context).pop();
                showReportSheet(
                  parentContext,
                  targetType: targetType,
                  targetId: contentId,
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.volume_off_outlined),
              title: Text(l10n.actionMute(author.username)),
              onTap: () => run(
                () => actions.mute(author.id),
                l10n.mutedToast(author.username),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.visibility_off_outlined),
              title: Text(l10n.actionRestrict(author.username)),
              onTap: () => run(
                () => actions.restrict(author.id),
                l10n.restrictedToast(author.username),
              ),
            ),
            ListTile(
              leading: Icon(Icons.block_rounded, color: context.scheme.error),
              title: Text(
                l10n.actionBlock(author.username),
                style: TextStyle(color: context.scheme.error),
              ),
              onTap: confirmBlock,
            ),
          ],
        ],
      ),
    );
  }
}
