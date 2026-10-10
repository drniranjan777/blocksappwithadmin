import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:flutter/material.dart';

/// Rounded, bordered surface for list rows. A [Material] (not a coloured
/// `DecoratedBox`) so `ListTile` ink splashes and backgrounds stay visible.
class SettingsCard extends StatelessWidget {
  const SettingsCard({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.scheme.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BlocksRadius.xl),
        side: BorderSide(color: context.scheme.outlineVariant),
      ),
      child: child,
    );
  }
}

/// A titled, rounded group of rows — the building block of every
/// settings-style screen.
class SettingsSection extends StatelessWidget {
  const SettingsSection({
    required this.title,
    required this.children,
    super.key,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            top: BlocksSpacing.xl,
            bottom: BlocksSpacing.sm,
            left: BlocksSpacing.xs,
          ),
          child: Semantics(
            header: true,
            child: Text(
              title.toUpperCase(),
              style: context.text.labelMedium?.copyWith(
                letterSpacing: 1.3,
                color: context.scheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
        SettingsCard(
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                children[i],
                if (i < children.length - 1) const Divider(height: 1),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class SettingsNavTile extends StatelessWidget {
  const SettingsNavTile({
    required this.icon,
    required this.title,
    required this.onTap,
    super.key,
    this.subtitle,
    this.trailingText,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailingText;
  final bool destructive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? context.scheme.error : context.scheme.primary;
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        title,
        style: destructive ? TextStyle(color: context.scheme.error) : null,
      ),
      subtitle: subtitle == null ? null : Text(subtitle!),
      // Bounded: a long value (or a big system font) must never take the whole
      // tile away from the title.
      trailing: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 132),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (trailingText != null)
              Flexible(
                child: Text(
                  trailingText!,
                  style: context.text.labelLarge,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            if (!destructive) const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
      onTap: onTap,
    );
  }
}

class SettingsInfoTile extends StatelessWidget {
  const SettingsInfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: context.scheme.primary),
    title: Text(title),
    subtitle: Text(subtitle),
  );
}

class SettingsSwitchTile extends StatelessWidget {
  const SettingsSwitchTile({
    required this.title,
    required this.value,
    required this.onChanged,
    super.key,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!),
    value: value,
    onChanged: onChanged,
  );
}

class SettingsChoiceRow extends StatelessWidget {
  const SettingsChoiceRow({
    required this.title,
    required this.child,
    super.key,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleSmall),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: context.text.bodySmall),
          ],
          const SizedBox(height: BlocksSpacing.md),
          child,
        ],
      ),
    );
  }
}
