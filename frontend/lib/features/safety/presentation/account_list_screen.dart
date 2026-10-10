import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_avatar.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/features/safety/application/safety_actions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AccountListKind { blocked, muted }

/// Blocked or muted accounts, each with an undo action.
class AccountListScreen extends ConsumerWidget {
  const AccountListScreen({required this.kind, super.key});

  final AccountListKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final isBlocked = kind == AccountListKind.blocked;
    final async = isBlocked
        ? ref.watch(blockedUsersProvider)
        : ref.watch(mutedUsersProvider);
    final list = async.value;
    final actions = ref.read(safetyActionsProvider);

    Future<void> undo(UserSummary u) async {
      if (isBlocked) {
        await actions.unblock(u.id);
      } else {
        await actions.unmute(u.id);
      }
      if (context.mounted) {
        showAppSnack(
          context,
          isBlocked
              ? l10n.unblockedToast(u.username)
              : l10n.unmutedToast(u.username),
        );
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(isBlocked ? l10n.blockedTitle : l10n.mutedTitle),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: list == null
              ? (async.hasError
                    ? ErrorView(
                        onRetry: () => ref.invalidate(
                          isBlocked ? blockedUsersProvider : mutedUsersProvider,
                        ),
                      )
                    : const LoadingView())
              : list.isEmpty
              ? EmptyView(
                  icon: isBlocked
                      ? Icons.block_rounded
                      : Icons.volume_off_rounded,
                  title: isBlocked ? l10n.blockedTitle : l10n.mutedTitle,
                  body: isBlocked ? l10n.blockedEmptyBody : l10n.mutedEmptyBody,
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(
                    vertical: BlocksSpacing.sm,
                  ),
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final u = list[i];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: BlocksSpacing.lg,
                      ),
                      leading: BlocksAvatar(
                        name: u.name,
                        imageUrl: u.avatarUrl,
                        size: 44,
                      ),
                      title: Text(u.name),
                      subtitle: Text(u.username),
                      trailing: BlocksButton(
                        label: isBlocked ? l10n.unblock : l10n.unmute,
                        expand: false,
                        variant: BlocksButtonVariant.outline,
                        onPressed: () => undo(u),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
