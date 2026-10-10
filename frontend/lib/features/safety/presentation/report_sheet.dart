import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/features/safety/application/safety_actions.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

extension ReportReasonLabels on ReportReason {
  String label(AppLocalizations l10n) => switch (this) {
    ReportReason.spam => l10n.reasonSpam,
    ReportReason.harassment => l10n.reasonHarassment,
    ReportReason.nudity => l10n.reasonNudity,
    ReportReason.violence => l10n.reasonViolence,
    ReportReason.selfHarm => l10n.reasonSelfHarm,
    ReportReason.misinformation => l10n.reasonMisinformation,
    ReportReason.scam => l10n.reasonScam,
    ReportReason.other => l10n.reasonOther,
  };
}

/// "Why are you reporting this?" flow. Works for posts, reels, comments and
/// users.
Future<void> showReportSheet(
  BuildContext context, {
  required ReportTargetType targetType,
  required String targetId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _ReportSheet(targetType: targetType, targetId: targetId),
  );
}

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.targetType, required this.targetId});

  final ReportTargetType targetType;
  final String targetId;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  ReportReason? _reason;
  bool _submitting = false;
  bool _submitted = false;
  final _details = TextEditingController();

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reason;
    if (reason == null || _submitting) return;
    setState(() => _submitting = true);
    await ref
        .read(safetyActionsProvider)
        .report(
          ReportRequest(
            targetType: widget.targetType,
            targetId: widget.targetId,
            reason: reason,
            details: _details.text.trim().isEmpty ? null : _details.text.trim(),
          ),
        );
    if (mounted) {
      setState(() {
        _submitting = false;
        _submitted = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    if (_submitted) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(
          BlocksSpacing.xl,
          BlocksSpacing.sm,
          BlocksSpacing.xl,
          BlocksSpacing.xxl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.verified_user_rounded,
              size: 48,
              color: context.blocks.success,
            ),
            const SizedBox(height: BlocksSpacing.lg),
            Text(
              l10n.reportThanksTitle,
              style: context.text.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BlocksSpacing.sm),
            Text(
              l10n.reportThanksBody,
              style: context.text.bodyMedium?.copyWith(
                color: context.scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BlocksSpacing.xl),
            BlocksButton(
              label: l10n.done,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          BlocksSpacing.xl,
          0,
          BlocksSpacing.xl,
          BlocksSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.reportTitle, style: context.text.titleLarge),
            ),
            const SizedBox(height: BlocksSpacing.xs),
            Text(l10n.reportSubtitle, style: context.text.bodySmall),
            const SizedBox(height: BlocksSpacing.md),
            RadioGroup<ReportReason>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: [
                  for (final r in ReportReason.values)
                    RadioListTile<ReportReason>(
                      value: r,
                      contentPadding: EdgeInsets.zero,
                      title: Text(r.label(l10n)),
                    ),
                ],
              ),
            ),
            if (_reason == ReportReason.other) ...[
              const SizedBox(height: BlocksSpacing.sm),
              TextField(
                controller: _details,
                maxLines: 3,
                maxLength: 300,
                decoration: InputDecoration(hintText: l10n.reportDetailsHint),
              ),
            ],
            const SizedBox(height: BlocksSpacing.lg),
            BlocksButton(
              label: l10n.reportSubmit,
              isLoading: _submitting,
              onPressed: _reason == null ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
