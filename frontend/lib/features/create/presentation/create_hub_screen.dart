import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Entry to every creation flow: Post, Reel, Story, Go Live.
class CreateHubScreen extends StatelessWidget {
  const CreateHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.blocks;
    final options = [
      (
        Icons.image_rounded,
        colors.reachState,
        l10n.createOptionPost,
        l10n.createOptionPostBody,
        Routes.createPost,
      ),
      (
        Icons.play_circle_rounded,
        colors.reachGlobal,
        l10n.createOptionReel,
        l10n.createOptionReelBody,
        Routes.createReel,
      ),
      (
        Icons.auto_awesome_rounded,
        colors.reachNational,
        l10n.createOptionStory,
        l10n.createOptionStoryBody,
        Routes.createStory,
      ),
      (
        Icons.sensors_rounded,
        colors.reachDistrict,
        l10n.createOptionLive,
        l10n.createOptionLiveBody,
        Routes.createLive,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.createTitle),
        leading: IconButton(
          tooltip: l10n.close,
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView.separated(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            itemCount: options.length,
            separatorBuilder: (_, _) =>
                const SizedBox(height: BlocksSpacing.md),
            itemBuilder: (context, i) {
              final (icon, color, title, body, route) = options[i];
              return Semantics(
                button: true,
                label: '$title. $body',
                excludeSemantics: true,
                child: Material(
                  color: context.scheme.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(BlocksRadius.xl),
                    side: BorderSide(color: context.scheme.outlineVariant),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(BlocksRadius.xl),
                    onTap: () => context.push(route),
                    child: Padding(
                      padding: const EdgeInsets.all(BlocksSpacing.lg),
                      child: Row(
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(
                                BlocksRadius.lg,
                              ),
                            ),
                            child: Icon(icon, color: color, size: 30),
                          ),
                          const SizedBox(width: BlocksSpacing.lg),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(title, style: context.text.titleMedium),
                                const SizedBox(height: 2),
                                Text(body, style: context.text.bodySmall),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.chevron_right_rounded,
                            color: context.scheme.onSurfaceVariant,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
