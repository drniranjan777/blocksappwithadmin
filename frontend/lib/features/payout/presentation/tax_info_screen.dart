import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/creator/presentation/widgets/creator_widgets.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/presentation/payout_center_screen.dart';
import 'package:blocks_app/features/payout/presentation/payout_labels.dart';
import 'package:blocks_app/features/payout/presentation/step_up_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

/// The tax identity the payout provider needs (PAN).
///
/// BLOCKS only **collects** it. It does not calculate tax: if a deduction
/// applies, the payout service applies and itemises it. The number is shown
/// masked, always.
class TaxInfoScreen extends ConsumerStatefulWidget {
  const TaxInfoScreen({super.key});

  @override
  ConsumerState<TaxInfoScreen> createState() => _TaxInfoScreenState();
}

class _TaxInfoScreenState extends ConsumerState<TaxInfoScreen> {
  final _pan = TextEditingController();
  bool _editing = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _pan
      ..clear()
      ..dispose();
    super.dispose();
  }

  static final _format = RegExp(r'^[A-Z]{5}\d{4}[A-Z]$');

  Future<void> _save() async {
    final l10n = context.l10n;
    final value = _pan.text.replaceAll(RegExp(r'\s'), '').toUpperCase();
    if (!_format.hasMatch(value)) {
      setState(() => _error = l10n.taxErrPan);
      return;
    }
    final token = await showStepUp(context, StepUpPurpose.updateTaxInfo);
    if (token == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(taxRepositoryProvider)
          .saveTaxInfo(pan: value, stepUpToken: token);
      _pan.clear();
      ref.invalidate(taxInfoProvider);
      if (mounted) {
        setState(() {
          _busy = false;
          _editing = false;
        });
        showAppSnack(context, l10n.taxSaved);
      }
    } on FieldValidationFailure {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.taxErrPan;
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = l10n.errorBody;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = ref.watch(taxInfoProvider);
    final locale = Localizations.localeOf(context).toString();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.taxTitle)),
      body: SafeArea(
        child: ResponsiveCenter(
          maxWidth: 560,
          child: data.when(
            loading: () => const LoadingView(),
            error: (err, _) => ErrorView(
              error: err,
              onRetry: () => ref.invalidate(taxInfoProvider),
            ),
            data: (t) {
              final provided = t.status == TaxInfoStatus.provided;
              return ListView(
                padding: const EdgeInsets.all(BlocksSpacing.lg),
                children: [
                  StudioCard(
                    title: l10n.taxPanTitle,
                    trailing: Icon(
                      provided
                          ? Icons.check_circle_rounded
                          : Icons.info_outline_rounded,
                      color: provided
                          ? context.blocks.success
                          : context.scheme.outline,
                      semanticLabel: provided
                          ? l10n.taxProvided
                          : l10n.taxNotProvided,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (provided) ...[
                          Semantics(
                            label: '${l10n.taxPanTitle}: ${t.maskedPan}',
                            excludeSemantics: true,
                            child: Text(
                              t.maskedPan,
                              style: context.text.headlineSmall?.copyWith(
                                letterSpacing: 2,
                              ),
                            ),
                          ),
                          if (t.updatedAt != null)
                            Text(
                              l10n.taxUpdatedOn(
                                DateFormat.yMMMd(locale).format(t.updatedAt!),
                              ),
                              style: context.text.bodySmall,
                            ),
                        ] else
                          Text(
                            l10n.taxNotProvided,
                            style: context.text.bodyLarge,
                          ),
                        const SizedBox(height: BlocksSpacing.md),
                        if (_editing) ...[
                          TextField(
                            controller: _pan,
                            textCapitalization: TextCapitalization.characters,
                            autocorrect: false,
                            enableSuggestions: false,
                            enableIMEPersonalizedLearning: false,
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(
                                RegExp('[A-Za-z0-9]'),
                              ),
                              LengthLimitingTextInputFormatter(10),
                            ],
                            decoration: InputDecoration(
                              labelText: l10n.taxPanLabel,
                              hintText: 'ABCDE1234F',
                              errorText: _error,
                            ),
                          ),
                          const SizedBox(height: BlocksSpacing.md),
                          BlocksButton(
                            label: l10n.taxSave,
                            isLoading: _busy,
                            onPressed: _save,
                          ),
                          const SizedBox(height: BlocksSpacing.sm),
                          BlocksButton(
                            label: l10n.cancel,
                            variant: BlocksButtonVariant.tonal,
                            onPressed: () => setState(() {
                              _editing = false;
                              _error = null;
                              _pan.clear();
                            }),
                          ),
                        ] else
                          BlocksButton(
                            label: provided ? l10n.taxUpdate : l10n.taxAdd,
                            icon: Icons.edit_rounded,
                            onPressed: () => setState(() => _editing = true),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  StudioCard(
                    title: l10n.taxAccountTitle,
                    child: Semantics(
                      container: true,
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              l10n.taxAccountType,
                              style: context.text.bodyMedium,
                            ),
                          ),
                          Text(
                            t.accountType == null
                                ? l10n.taxAccountUnknown
                                : kycSubjectLabel(l10n, t.accountType!),
                            style: context.text.titleSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  StudioCard(
                    title: l10n.taxDocsTitle,
                    subtitle: l10n.taxDocsBody,
                    child: t.documents.isEmpty
                        ? Text(
                            l10n.taxDocsEmpty,
                            style: context.text.bodyMedium,
                          )
                        : Column(
                            children: [
                              for (final d in t.documents)
                                _DocumentRow(doc: d, locale: locale),
                            ],
                          ),
                  ),
                  const SizedBox(height: BlocksSpacing.lg),
                  StatusBannerInfo(text: l10n.taxNote),
                  const SizedBox(height: BlocksSpacing.xl),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// One document the provider issued, or will issue.
class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.doc, required this.locale});

  final TaxDocument doc;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isStatement = doc.kind == TaxDocumentKind.payoutStatement;
    final title = isStatement ? l10n.taxDocStatement : l10n.taxDocCertificate;
    final when = isStatement
        ? DateFormat.yMMM(locale).format(doc.period)
        : l10n.taxDocQuarter((doc.period.month - 1) ~/ 3 + 1, doc.period.year);
    final ready = doc.status == TaxDocumentStatus.available;
    final status = ready ? l10n.taxDocReady : l10n.taxDocLater;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlocksSpacing.sm),
      child: Semantics(
        container: true,
        label: '$title, $when, $status',
        excludeSemantics: true,
        child: Row(
          children: [
            Icon(
              isStatement
                  ? Icons.receipt_long_rounded
                  : Icons.verified_outlined,
              color: context.scheme.primary,
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: context.text.titleSmall),
                  Text(when, style: context.text.bodySmall),
                  // Under the title, not beside it: "issued after the period
                  // ends" is long, especially in Hindi and Telugu.
                  Text(
                    status,
                    style: context.text.labelMedium?.copyWith(
                      color: ready
                          ? context.blocks.success
                          : context.scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
