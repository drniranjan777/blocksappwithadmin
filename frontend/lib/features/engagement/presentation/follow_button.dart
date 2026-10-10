import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/features/engagement/application/engagement_controllers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Follow / Following toggle backed by the shared following set, so it stays
/// in sync across Home, Reels, Search and Profile.
class FollowButton extends ConsumerWidget {
  const FollowButton({
    required this.userId,
    super.key,
    this.expand = false,
    this.onDark = false,
  });

  final String userId;
  final bool expand;

  /// White-outline styling for use over video.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final following = ref.watch(isFollowingProvider(userId));
    final l10n = context.l10n;

    final BlocksButtonVariant variant;
    if (onDark) {
      variant = following
          ? BlocksButtonVariant.onDarkOutline
          : BlocksButtonVariant.onDark;
    } else {
      variant = following
          ? BlocksButtonVariant.outline
          : BlocksButtonVariant.primary;
    }

    final button = BlocksButton(
      label: following ? l10n.actionFollowing : l10n.actionFollow,
      variant: variant,
      expand: expand,
      onPressed: () => ref.read(followingProvider.notifier).toggle(userId),
    );
    if (expand) return button;

    // Compact version: a 40 dp pill inside a 48 dp touch target.
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 96),
      child: SizedBox(
        height: 48,
        child: Theme(
          data: Theme.of(context).copyWith(
            filledButtonTheme: FilledButtonThemeData(
              style: FilledButton.styleFrom(
                minimumSize: const Size(96, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
            ),
            outlinedButtonTheme: OutlinedButtonThemeData(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(96, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                foregroundColor: onDark ? Colors.white : null,
              ),
            ),
          ),
          child: button,
        ),
      ),
    );
  }
}
