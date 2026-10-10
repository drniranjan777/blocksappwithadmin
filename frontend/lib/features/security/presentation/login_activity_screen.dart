import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_chip.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:blocks_app/features/security/presentation/security_labels.dart';
import 'package:blocks_app/features/settings/presentation/settings_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// The account's security timeline: sign-ins, failures and account changes.
class LoginActivityScreen extends ConsumerWidget {
  const LoginActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final filter = ref.watch(securityFilterProvider);
    final events = ref.watch(securityEventsProvider(filter));
    final now = ref.read(clockProvider)();

    final chips = <(SecurityEventFilter, String)>[
      (SecurityEventFilter.all, l10n.actFilterAll),
      (SecurityEventFilter.successful, l10n.actFilterSuccessful),
      (SecurityEventFilter.failed, l10n.actFilterFailed),
      (SecurityEventFilter.suspicious, l10n.actFilterSuspicious),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.actTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  BlocksSpacing.lg,
                  BlocksSpacing.md,
                  BlocksSpacing.lg,
                  BlocksSpacing.sm,
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Wrap(
                    spacing: BlocksSpacing.sm,
                    runSpacing: BlocksSpacing.sm,
                    children: [
                      for (final (f, label) in chips)
                        BlocksChip(
                          label: label,
                          selected: f == filter,
                          onSelected: () => ref
                              .read(securityFilterProvider.notifier)
                              .select(f),
                        ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: AsyncValueView<List<SecurityEvent>>(
                  value: events,
                  onRetry: () => ref.invalidate(securityEventsProvider(filter)),
                  data: (list) => list.isEmpty
                      ? EmptyView(
                          icon: Icons.history_rounded,
                          title: l10n.actEmptyTitle,
                          body: l10n.actEmptyBody,
                        )
                      : _Timeline(events: list, now: now),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events, required this.now});

  final List<SecurityEvent> events;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    // Flatten into day headers + rows so the list stays lazy.
    final rows = <Object>[];
    DateTime? day;
    for (final e in events) {
      if (day == null || !isSameDay(day, e.timestamp)) {
        day = e.timestamp;
        rows.add(day);
      }
      rows.add(e);
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(
        BlocksSpacing.lg,
        0,
        BlocksSpacing.lg,
        BlocksSpacing.xl,
      ),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        final row = rows[i];
        if (row is DateTime) {
          return Padding(
            padding: const EdgeInsets.only(
              top: BlocksSpacing.lg,
              bottom: BlocksSpacing.sm,
            ),
            child: Semantics(
              header: true,
              child: Text(
                dayLabel(context, row, now),
                style: context.text.titleSmall,
              ),
            ),
          );
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: BlocksSpacing.sm),
          child: _EventTile(event: row as SecurityEvent),
        );
      },
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});

  final SecurityEvent event;

  bool get _opensAlert => event.type == SecurityEventType.suspiciousLogin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = securityStatusColor(context, event.status);
    final title = securityEventTitle(l10n, event.type);
    final where = '${event.deviceName} · ${event.approximateLocation}';

    final content = Padding(
      padding: const EdgeInsets.all(BlocksSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(BlocksRadius.md),
            ),
            child: Icon(securityEventIcon(event.type), color: color, size: 22),
          ),
          const SizedBox(width: BlocksSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall),
                const SizedBox(height: 2),
                Text(where, style: context.text.bodySmall),
                if (event.attempts != null)
                  Text(
                    l10n.evAttempts(event.attempts!),
                    style: context.text.bodySmall,
                  ),
              ],
            ),
          ),
          const SizedBox(width: BlocksSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatClock(context, event.timestamp),
                style: context.text.labelMedium,
              ),
              if (event.acknowledged)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(l10n.evReviewed, style: context.text.labelSmall),
                ),
            ],
          ),
        ],
      ),
    );

    return SettingsCard(
      child: _opensAlert
          ? Semantics(
              button: true,
              label: '$title. $where. ${formatClock(context, event.timestamp)}',
              excludeSemantics: true,
              child: InkWell(
                onTap: () => context.push(Routes.securityAlert(event.id)),
                child: content,
              ),
            )
          : Semantics(
              container: true,
              label: '$title. $where. ${formatClock(context, event.timestamp)}',
              excludeSemantics: true,
              child: content,
            ),
    );
  }
}
