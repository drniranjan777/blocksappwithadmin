import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';

/// A labelled slider row: "Brightness            +20".
class PanelSlider extends StatelessWidget {
  const PanelSlider({
    required this.label,
    required this.value,
    required this.onChanged,
    super.key,
    this.min = 0,
    this.max = 1,
    this.valueLabel,
    this.divisions,
    this.onChangeEnd,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final int? divisions;
  final String? valueLabel;
  final ValueChanged<double>? onChanged;
  final ValueChanged<double>? onChangeEnd;

  @override
  Widget build(BuildContext context) {
    final shown = valueLabel ?? '${(value * 100).round()}%';
    return Semantics(
      container: true,
      label: label,
      value: shown,
      child: Row(
        children: [
          SizedBox(
            width: 104,
            child: ExcludeSemantics(
              child: Text(
                label,
                style: context.text.labelLarge,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          Expanded(
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              divisions: divisions,
              onChanged: onChanged,
              onChangeEnd: onChangeEnd,
              semanticFormatterCallback: (_) => shown,
            ),
          ),
          SizedBox(
            width: 48,
            child: ExcludeSemantics(
              child: Text(
                shown,
                textAlign: TextAlign.end,
                style: context.text.labelMedium,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A 48 dp icon + label button used in the tool panels.
class PanelAction extends StatelessWidget {
  const PanelAction({
    required this.icon,
    required this.label,
    required this.onPressed,
    super.key,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    // Ink colours chosen for the container they sit on: error-on-error would
    // be unreadable.
    final color = destructive ? scheme.onErrorContainer : scheme.primary;
    final enabled = onPressed != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: (destructive ? scheme.errorContainer : scheme.primaryContainer)
            .withValues(alpha: enabled ? 0.7 : 0.3),
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onPressed,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: BlocksSpacing.touchTarget,
              minWidth: BlocksSpacing.touchTarget,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20, color: enabled ? color : scheme.outline),
                  const SizedBox(width: BlocksSpacing.sm),
                  Text(
                    label,
                    style: context.text.labelLarge?.copyWith(
                      color: enabled ? color : scheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A selectable pill with a 48 dp touch target (the visible pill is smaller).
class PanelChip extends StatelessWidget {
  const PanelChip({
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final fg = selected ? scheme.onPrimary : scheme.onSurface;
    return Semantics(
      button: true,
      selected: selected,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: BlocksSpacing.touchTarget,
            minWidth: BlocksSpacing.touchTarget,
          ),
          child: Center(
            widthFactor: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: selected ? scheme.primary : scheme.surface,
                borderRadius: BorderRadius.circular(BlocksRadius.pill),
                border: Border.all(
                  color: selected ? scheme.primary : scheme.outlineVariant,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BlocksSpacing.lg,
                  vertical: 8,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[
                      Icon(icon, size: 16, color: fg),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.labelLarge?.copyWith(color: fg),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PanelHint extends StatelessWidget {
  const PanelHint(
    this.text, {
    super.key,
    this.icon = Icons.info_outline_rounded,
  });

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: context.scheme.onSurfaceVariant),
          const SizedBox(width: BlocksSpacing.sm),
          Expanded(child: Text(text, style: context.text.bodyMedium)),
        ],
      ),
    );
  }
}

class PanelTitle extends StatelessWidget {
  const PanelTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(
      top: BlocksSpacing.sm,
      bottom: BlocksSpacing.xs,
    ),
    child: Semantics(
      header: true,
      child: Text(text, style: context.text.titleSmall),
    ),
  );
}

/// A round colour swatch with a ring when selected (48 dp touch target).
class ColorSwatchButton extends StatelessWidget {
  const ColorSwatchButton({
    required this.color,
    required this.selected,
    required this.label,
    required this.onTap,
    super.key,
  });

  final Color color;
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 24,
        child: SizedBox(
          width: BlocksSpacing.touchTarget,
          height: BlocksSpacing.touchTarget,
          child: Center(
            child: AnimatedContainer(
              duration: BlocksDurations.fast,
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected
                      ? context.scheme.primary
                      : context.scheme.outlineVariant,
                  width: selected ? 3 : 1,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Wraps tool-panel content so it scrolls instead of overflowing on small
/// screens or at large text sizes.
class PanelScaffold extends StatelessWidget {
  const PanelScaffold({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );
}
