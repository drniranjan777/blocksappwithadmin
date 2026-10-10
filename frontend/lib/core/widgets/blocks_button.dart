import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:flutter/material.dart';

enum BlocksButtonVariant {
  /// Brand-filled primary action.
  primary,

  /// Soft tonal secondary action.
  tonal,

  /// Outlined, lowest emphasis that still reads as a button.
  outline,

  /// Text-only.
  ghost,

  /// White button for use on the dark hero gradient.
  onDark,

  /// Translucent outlined button for secondary actions on the hero gradient.
  onDarkOutline,
}

class BlocksButton extends StatelessWidget {
  const BlocksButton({
    required this.label,
    required this.onPressed,
    super.key,
    this.variant = BlocksButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final BlocksButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = onPressed != null && !isLoading;
    final handler = enabled ? onPressed : null;

    final child = isLoading
        ? const SizedBox.square(
            dimension: 20,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: BlocksSpacing.sm),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          );

    final button = switch (variant) {
      BlocksButtonVariant.primary => FilledButton(
        onPressed: handler,
        child: child,
      ),
      BlocksButtonVariant.tonal => FilledButton(
        onPressed: handler,
        style: FilledButton.styleFrom(
          backgroundColor: scheme.primaryContainer,
          foregroundColor: scheme.onPrimaryContainer,
        ),
        child: child,
      ),
      BlocksButtonVariant.outline => OutlinedButton(
        onPressed: handler,
        child: child,
      ),
      BlocksButtonVariant.ghost => TextButton(onPressed: handler, child: child),
      BlocksButtonVariant.onDark => FilledButton(
        onPressed: handler,
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF11142B),
        ),
        child: child,
      ),
      BlocksButtonVariant.onDarkOutline => OutlinedButton(
        onPressed: handler,
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: BorderSide(color: Colors.white.withValues(alpha: 0.4)),
        ),
        child: child,
      ),
    };

    // The app theme gives buttons an infinite minimum width (full-width
    // CTAs). Shrink-wrapped buttons (app bars, rows) must drop that, or they
    // crash with "BoxConstraints forces an infinite width".
    final theme = Theme.of(context);
    const compactMin = WidgetStatePropertyAll<Size>(
      Size(64, BlocksSpacing.touchTarget),
    );
    final laidOut = expand
        ? SizedBox(width: double.infinity, child: button)
        : Theme(
            data: theme.copyWith(
              filledButtonTheme: FilledButtonThemeData(
                style: theme.filledButtonTheme.style?.copyWith(
                  minimumSize: compactMin,
                ),
              ),
              outlinedButtonTheme: OutlinedButtonThemeData(
                style: theme.outlinedButtonTheme.style?.copyWith(
                  minimumSize: compactMin,
                ),
              ),
              textButtonTheme: TextButtonThemeData(
                style: theme.textButtonTheme.style?.copyWith(
                  minimumSize: compactMin,
                ),
              ),
            ),
            child: button,
          );

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      onTap: handler,
      child: laidOut,
    );
  }
}
