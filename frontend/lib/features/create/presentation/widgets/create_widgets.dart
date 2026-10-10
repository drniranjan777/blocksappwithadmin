import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/constants/districts.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/demo_art.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/create/presentation/create_labels.dart';
import 'package:blocks_app/features/reach/application/reach_providers.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:blocks_app/features/reach/presentation/reach_level_labels.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_ladder.dart';
import 'package:blocks_app/features/reach/presentation/widgets/reach_level_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
      child: Semantics(
        header: true,
        child: Text(text, style: context.text.titleSmall),
      ),
    );
  }
}

/// Grid of selectable demo-gallery tiles.
class DemoMediaGrid extends StatelessWidget {
  const DemoMediaGrid({
    required this.seeds,
    required this.selected,
    required this.onSelected,
    super.key,
    this.isVideo = false,
  });

  final List<int> seeds;
  final int? selected;
  final ValueChanged<int> onSelected;
  final bool isVideo;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
      ),
      itemCount: seeds.length,
      itemBuilder: (context, i) {
        final seed = seeds[i];
        final isSelected = seed == selected;
        return Semantics(
          button: true,
          selected: isSelected,
          label:
              '${isVideo ? context.l10n.videoLabel : context.l10n.createTypePhoto} ${i + 1}',
          excludeSemantics: true,
          child: GestureDetector(
            onTap: () => onSelected(seed),
            child: AnimatedContainer(
              duration: BlocksDurations.fast,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BlocksRadius.md),
                border: Border.all(
                  color: isSelected
                      ? context.scheme.primary
                      : Colors.transparent,
                  width: 3,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(BlocksRadius.md - 2),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    DemoArt(seed: seed),
                    if (isVideo)
                      const Center(
                        child: Icon(
                          Icons.play_circle_fill_rounded,
                          color: Colors.white,
                          size: 26,
                        ),
                      ),
                    if (isSelected)
                      Align(
                        alignment: Alignment.topRight,
                        child: Container(
                          margin: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: context.scheme.primary,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: context.scheme.onPrimary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// "Hyderabad, Telangana  [Change]" with the privacy note.
class LocationField extends StatelessWidget {
  const LocationField({
    required this.district,
    required this.state,
    required this.onChanged,
    super.key,
  });

  final String district;
  final String state;
  final ValueChanged<District> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel(l10n.createLocation),
        Material(
          color: context.scheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BlocksRadius.lgAll,
            side: BorderSide(color: context.scheme.outlineVariant),
          ),
          child: InkWell(
            borderRadius: BlocksRadius.lgAll,
            onTap: () async {
              final picked = await showDistrictPicker(context);
              if (picked != null) onChanged(picked);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BlocksSpacing.lg,
                vertical: BlocksSpacing.md,
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.location_on_rounded,
                    color: context.scheme.primary,
                  ),
                  const SizedBox(width: BlocksSpacing.md),
                  Expanded(
                    child: Text(
                      '$district, $state',
                      style: context.text.titleSmall,
                    ),
                  ),
                  Text(
                    l10n.createChangeLocation,
                    style: context.text.labelLarge?.copyWith(
                      color: context.scheme.primary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: BlocksSpacing.xs + 2),
        Row(
          children: [
            Icon(
              Icons.shield_outlined,
              size: 14,
              color: context.scheme.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                l10n.createLocationNote,
                style: context.text.bodySmall,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

Future<District?> showDistrictPicker(BuildContext context) {
  return showModalBottomSheet<District>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _DistrictPicker(),
  );
}

class _DistrictPicker extends StatefulWidget {
  const _DistrictPicker();

  @override
  State<_DistrictPicker> createState() => _DistrictPickerState();
}

class _DistrictPickerState extends State<_DistrictPicker> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final list = kDistricts
        .where(
          (d) =>
              q.isEmpty ||
              d.name.toLowerCase().contains(q) ||
              d.state.toLowerCase().contains(q),
        )
        .toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scroll) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BlocksSpacing.lg),
              child: TextField(
                autofocus: false,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: context.l10n.createSearchDistrict,
                  prefixIcon: const Icon(Icons.search_rounded),
                ),
              ),
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Expanded(
              child: ListView.builder(
                controller: scroll,
                itemCount: list.length,
                itemBuilder: (context, i) => ListTile(
                  leading: const Icon(Icons.location_city_rounded),
                  title: Text(list[i].name),
                  subtitle: Text(list[i].state),
                  onTap: () => Navigator.of(context).pop(list[i]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AudiencePicker extends StatelessWidget {
  const AudiencePicker({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final PostAudience value;
  final ValueChanged<PostAudience> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FieldLabel(l10n.createAudience),
        Wrap(
          spacing: BlocksSpacing.sm,
          runSpacing: BlocksSpacing.sm,
          children: [
            for (final a in PostAudience.values)
              BlocksChip(
                label: a.label(l10n),
                selected: a == value,
                onSelected: () => onChanged(a),
              ),
          ],
        ),
      ],
    );
  }
}

/// "Starts at D1 · Hyderabad" — sets the expectation for the Reach Ladder.
class ReachStartCard extends ConsumerWidget {
  const ReachStartCard({required this.district, super.key});

  final String district;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final progress = ref.watch(reachCalculatorProvider).evaluate(0);
    return Container(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      decoration: BoxDecoration(
        color: context.scheme.primaryContainer.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(BlocksRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const ReachLevelBadge(
                level: ReachLevel.district,
                showName: false,
              ),
              const SizedBox(width: BlocksSpacing.sm),
              Expanded(
                child: Text(
                  l10n.createStartsAt(
                    ReachLevel.district.label(l10n),
                    district,
                  ),
                  style: context.text.titleSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: BlocksSpacing.md),
          ReachLadder(progress: progress, compact: true),
          const SizedBox(height: BlocksSpacing.md),
          Text(l10n.createStartsBody, style: context.text.bodySmall),
        ],
      ),
    );
  }
}
