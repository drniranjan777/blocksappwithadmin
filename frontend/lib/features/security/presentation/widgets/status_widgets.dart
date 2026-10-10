import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:flutter/material.dart';

enum StatusKind { success, error, warning, info }

/// An inline message that screen readers announce as soon as it appears
/// (errors and confirmations must not be silent).
class StatusBanner extends StatelessWidget {
  const StatusBanner({
    required this.kind,
    required this.title,
    super.key,
    this.body,
  });

  const StatusBanner.error({required this.title, super.key, this.body})
    : kind = StatusKind.error;

  const StatusBanner.success({required this.title, super.key, this.body})
    : kind = StatusKind.success;

  const StatusBanner.warning({required this.title, super.key, this.body})
    : kind = StatusKind.warning;

  final StatusKind kind;
  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (kind) {
      StatusKind.success => (
        Icons.check_circle_rounded,
        context.blocks.success,
      ),
      StatusKind.error => (Icons.error_outline_rounded, context.scheme.error),
      StatusKind.warning => (
        Icons.warning_amber_rounded,
        context.blocks.warning,
      ),
      StatusKind.info => (Icons.info_outline_rounded, context.scheme.primary),
    };
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(BlocksSpacing.md),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(BlocksRadius.lg),
          border: Border.all(color: color.withValues(alpha: 0.35)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  if (body != null) ...[
                    const SizedBox(height: BlocksSpacing.xs),
                    Text(body!, style: context.text.bodySmall),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A full-screen outcome ("Password Changed", "Email Updated", ...).
class ResultPanel extends StatelessWidget {
  const ResultPanel({
    required this.icon,
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onAction,
    super.key,
    this.secondaryLabel,
    this.onSecondary,
    this.kind = StatusKind.success,
  });

  final IconData icon;
  final String title;
  final String body;
  final String actionLabel;
  final VoidCallback onAction;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final StatusKind kind;

  @override
  Widget build(BuildContext context) {
    final color = switch (kind) {
      StatusKind.success => context.blocks.success,
      StatusKind.error => context.scheme.error,
      StatusKind.warning => context.blocks.warning,
      StatusKind.info => context.scheme.primary,
    };
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(BlocksSpacing.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Semantics(
            liveRegion: true,
            container: true,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(BlocksRadius.xl + 4),
                  ),
                  child: Icon(icon, size: 44, color: color),
                ),
                const SizedBox(height: BlocksSpacing.xl),
                Text(
                  title,
                  style: context.text.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: BlocksSpacing.sm),
                Text(
                  body,
                  style: context.text.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: BlocksSpacing.xl),
                BlocksButton(label: actionLabel, onPressed: onAction),
                if (secondaryLabel != null && onSecondary != null) ...[
                  const SizedBox(height: BlocksSpacing.sm),
                  BlocksButton(
                    label: secondaryLabel!,
                    variant: BlocksButtonVariant.ghost,
                    onPressed: onSecondary,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
