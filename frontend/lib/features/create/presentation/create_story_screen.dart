import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/constants/demo_media.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/features/create/application/create_controllers.dart';
import 'package:blocks_app/features/create/presentation/widgets/create_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class CreateStoryScreen extends ConsumerStatefulWidget {
  const CreateStoryScreen({super.key});

  @override
  ConsumerState<CreateStoryScreen> createState() => _CreateStoryScreenState();
}

class _CreateStoryScreenState extends ConsumerState<CreateStoryScreen> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _share() async {
    final l10n = context.l10n;
    await ref.read(createStoryControllerProvider.notifier).submit();
    if (!mounted) return;
    showAppSnack(context, l10n.createStoryPosted);
    // Stories are created from Home's tray or the Create hub.
    context.go(Routes.home);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = ref.watch(createStoryControllerProvider);
    final c = ref.read(createStoryControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.createStoryTitle),
        leading: IconButton(
          tooltip: l10n.close,
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxHeight: 420,
                    maxWidth: 260,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(BlocksRadius.xl),
                    child: AspectRatio(
                      aspectRatio: 9 / 16,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          DemoArt(seed: s.mediaSeed),
                          if (s.text.trim().isNotEmpty)
                            Center(
                              child: Padding(
                                padding: const EdgeInsets.all(BlocksSpacing.lg),
                                child: Text(
                                  s.text,
                                  textAlign: TextAlign.center,
                                  style: context.text.headlineSmall?.copyWith(
                                    color: Colors.white,
                                    shadows: const [
                                      Shadow(
                                        blurRadius: 12,
                                        color: Colors.black54,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Center(
                child: Text(
                  l10n.createOptionStoryBody,
                  style: context.text.bodySmall,
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              FieldLabel(l10n.createPickPhoto),
              SizedBox(
                height: 64,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: kDemoPhotoSeeds.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(width: BlocksSpacing.sm),
                  itemBuilder: (context, i) {
                    final seed = kDemoPhotoSeeds[i];
                    final selected = seed == s.mediaSeed;
                    return Semantics(
                      button: true,
                      selected: selected,
                      label: '${l10n.createTypePhoto} ${i + 1}',
                      excludeSemantics: true,
                      child: GestureDetector(
                        onTap: () => c.selectMedia(seed),
                        child: Container(
                          width: 48,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(
                              BlocksRadius.md,
                            ),
                            border: Border.all(
                              color: selected
                                  ? context.scheme.primary
                                  : Colors.transparent,
                              width: 3,
                            ),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(
                              BlocksRadius.md - 2,
                            ),
                            child: DemoArt(seed: seed),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              FieldLabel(l10n.createStoryText),
              TextField(
                controller: _text,
                onChanged: c.setText,
                maxLength: 80,
                decoration: InputDecoration(hintText: l10n.createStoryTextHint),
              ),
              const SizedBox(height: BlocksSpacing.lg),
              BlocksButton(
                label: l10n.createStoryShare,
                isLoading: s.isSubmitting,
                onPressed: _share,
              ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
