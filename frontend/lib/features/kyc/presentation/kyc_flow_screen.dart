import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/utils/id_mask.dart';
import 'package:blocks_app/core/widgets/blocks_button.dart';
import 'package:blocks_app/core/widgets/poll_while.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/kyc/application/kyc_providers.dart';
import 'package:blocks_app/features/kyc/domain/kyc_form_validator.dart';
import 'package:blocks_app/features/kyc/presentation/kyc_file_sheet.dart';
import 'package:blocks_app/features/payout/application/payout_providers.dart';
import 'package:blocks_app/features/payout/presentation/payout_labels.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reel_studio/presentation/widgets/panel_parts.dart';
import 'package:blocks_app/features/security/presentation/widgets/status_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

enum _Step { type, details, documents, review, status }

/// What the creator is typing for one document. The raw number lives only in
/// this object's text controller while the form is open: it is never put in
/// app state, never logged, and is cleared as soon as it is sent.
class _DocForm {
  _DocForm();

  String? typeId;
  final TextEditingController number = TextEditingController();
  KycFile? front;
  KycFile? back;

  void dispose() {
    number
      ..clear()
      ..dispose();
  }

  void clear() {
    number.clear();
    front = null;
    back = null;
  }

  KycDocumentInput? toInput() {
    final t = typeId;
    final f = front;
    if (t == null || f == null) return null;
    return KycDocumentInput(
      typeId: t,
      number: number.text,
      file: f,
      backFile: back,
    );
  }
}

/// Identity verification: who you are, which documents, a last look, then the
/// live result. The review itself happens on the server.
class KycFlowScreen extends ConsumerStatefulWidget {
  const KycFlowScreen({super.key});

  @override
  ConsumerState<KycFlowScreen> createState() => _KycFlowScreenState();
}

class _KycFlowScreenState extends ConsumerState<KycFlowScreen> {
  _Step _step = _Step.type;
  KycSubject _subject = KycSubject.individual;
  final _name = TextEditingController();
  final _business = TextEditingController();
  DateTime? _dob;
  String? _businessType;

  /// The server's minimum age, kept for the error text.
  int _minAge = 18;
  final _primary = _DocForm();
  final _signatory = _DocForm();
  Map<String, String> _errors = const {};
  bool _submitting = false;
  bool _checkedExisting = false;

  @override
  void dispose() {
    _name.dispose();
    _business.dispose();
    _primary.dispose();
    _signatory.dispose();
    super.dispose();
  }

  bool get _isBusiness => _subject == KycSubject.business;

  static const _detailsKeys = [
    'legalName',
    'businessName',
    'businessType',
    'dateOfBirth',
  ];

  static bool _hasDetailsError(Map<String, String> errors) =>
      _detailsKeys.any(errors.containsKey);

  /// Leaves the details step only when the details themselves are fine, so a
  /// missing birth date is flagged where it is typed, not after the documents.
  void _continueFromDetails(KycConfig cfg) {
    final all = KycFormValidator.validate(
      subject: _subject,
      legalName: _name.text,
      businessName: _business.text,
      documents: const [],
      config: cfg,
      now: ref.read(clockProvider)(),
      dateOfBirth: _dob,
      businessType: _businessType ?? '',
    );
    final problems = {
      for (final e in all.entries)
        if (_detailsKeys.contains(e.key)) e.key: e.value,
    };
    if (problems.isEmpty) {
      _go(_Step.documents);
    } else {
      setState(() => _errors = problems);
    }
  }

  Future<void> _pickDob(KycConfig cfg) async {
    final now = ref.read(clockProvider)();
    // Nobody younger than the server's minimum can be chosen.
    final latest = DateTime(now.year - cfg.minimumAge, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 30, 1, 1),
      firstDate: DateTime(1900),
      lastDate: latest,
      helpText: context.l10n.kycDob,
    );
    if (picked != null && mounted) {
      setState(() {
        _dob = picked;
        _errors = Map.of(_errors)..remove('dateOfBirth');
      });
    }
  }

  void _go(_Step s) => setState(() {
    _step = s;
    _errors = const {};
  });

  String _error(String key) {
    final code = _errors[key];
    if (code == null) return '';
    final l = context.l10n;
    return switch ((key, code)) {
      ('legalName', _) => l.kycErrName,
      ('businessName', _) => l.kycErrBusiness,
      ('businessType', _) => l.kycErrBusinessType,
      ('dateOfBirth', 'underage') => l.kycErrAge(_minAge),
      ('dateOfBirth', 'invalid') => l.kycErrDobInvalid,
      ('dateOfBirth', _) => l.kycErrDobRequired,
      ('number', _) => l.kycErrNumber,
      ('file', 'tooLarge') => l.kycErrFileLarge,
      ('file', 'unsupported') => l.kycErrFileType,
      ('file', _) => l.kycErrFileMissing,
      ('document', 'unsupported') => l.kycErrDocUnsupported,
      ('document', _) => l.kycErrDocMissing,
      _ => l.errorBody,
    };
  }

  Future<void> _submit(KycConfig config) async {
    final inputs = [
      ?_primary.toInput(),
      if (_isBusiness) ?_signatory.toInput(),
    ];
    final problems = KycFormValidator.validate(
      subject: _subject,
      legalName: _name.text,
      businessName: _business.text,
      documents: inputs,
      config: config,
      now: ref.read(clockProvider)(),
      dateOfBirth: _dob,
      businessType: _businessType ?? '',
    );
    if (problems.isNotEmpty) {
      setState(() {
        _errors = problems;
        _step = _hasDetailsError(problems) ? _Step.details : _Step.documents;
      });
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref
          .read(kycRepositoryProvider)
          .submit(
            KycSubmission(
              subject: _subject,
              legalName: _name.text,
              businessName: _business.text,
              businessType: _businessType ?? '',
              dateOfBirth: _isBusiness ? null : _dob,
              documents: inputs,
            ),
          );
      // The numbers have done their job: wipe them from the form.
      _primary.clear();
      _signatory.clear();
      ref
        ..invalidate(kycApplicationProvider)
        ..invalidate(payoutOverviewProvider);
      if (mounted) {
        setState(() {
          _submitting = false;
          _step = _Step.status;
        });
      }
    } on FieldValidationFailure catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errors = e.errors;
        _step = _hasDetailsError(e.errors) ? _Step.details : _Step.documents;
      });
    } on AppFailure {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _errors = const {'form': 'failed'};
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final config = ref.watch(kycConfigProvider);
    final existing = ref.watch(kycApplicationProvider);

    // If a verification is already under way (or done), show that instead of
    // a blank form.
    if (!_checkedExisting && existing.hasValue) {
      _checkedExisting = true;
      final k = existing.requireValue;
      if (!k.status.canSubmit) _step = _Step.status;
    }

    return PopScope(
      canPop: _step == _Step.type || _step == _Step.status,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _go(_Step.values[_step.index - 1]);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.kycFlowTitle)),
        body: SafeArea(
          child: ResponsiveCenter(
            maxWidth: 560,
            child: config.when(
              loading: () => const LoadingView(),
              error: (err, _) => ErrorView(
                error: err,
                onRetry: () => ref.invalidate(kycConfigProvider),
              ),
              data: (cfg) => !_checkedExisting && existing.isLoading
                  ? const LoadingView()
                  : _body(context, cfg),
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, KycConfig cfg) {
    final l10n = context.l10n;
    _minAge = cfg.minimumAge;
    if (_step == _Step.status) return _StatusStep(onDone: () => context.pop());

    final index = _step.index;
    final total = _Step.status.index; // type, details, documents, review
    return ListView(
      padding: const EdgeInsets.all(BlocksSpacing.lg),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Semantics(
          label: l10n.kycStepOf(index + 1, total),
          child: Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(BlocksRadius.pill),
                  child: LinearProgressIndicator(
                    value: (index + 1) / total,
                    minHeight: 6,
                  ),
                ),
              ),
              const SizedBox(width: BlocksSpacing.md),
              ExcludeSemantics(
                child: Text(
                  l10n.kycStepOf(index + 1, total),
                  style: context.text.labelMedium,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.xl),
        if (_errors.containsKey('form'))
          Padding(
            padding: const EdgeInsets.only(bottom: BlocksSpacing.md),
            child: StatusBanner.error(title: l10n.errorBody),
          ),
        switch (_step) {
          _Step.type => _typeStep(context),
          _Step.details => _detailsStep(context, cfg),
          _Step.documents => _documentsStep(context, cfg),
          _Step.review => _reviewStep(context, cfg),
          _Step.status => const SizedBox.shrink(),
        },
      ],
    );
  }

  // ----------------------------------------------------------------- steps --

  Widget _typeStep(BuildContext context) {
    final l10n = context.l10n;
    Widget choice(KycSubject s, IconData icon, String title, String body) {
      final selected = _subject == s;
      return Semantics(
        button: true,
        selected: selected,
        label: '$title. $body',
        excludeSemantics: true,
        child: Material(
          color: selected
              ? context.scheme.primaryContainer
              : context.scheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BlocksRadius.xlAll,
            side: BorderSide(
              color: selected
                  ? context.scheme.primary
                  : context.scheme.outlineVariant,
              width: selected ? 2 : 1,
            ),
          ),
          child: InkWell(
            borderRadius: BlocksRadius.xlAll,
            onTap: () => setState(() => _subject = s),
            child: Padding(
              padding: const EdgeInsets.all(BlocksSpacing.lg),
              child: Row(
                children: [
                  Icon(icon, size: 32, color: context.scheme.primary),
                  const SizedBox(width: BlocksSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: context.text.titleMedium),
                        Text(body, style: context.text.bodySmall),
                      ],
                    ),
                  ),
                  Icon(
                    selected
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: selected
                        ? context.scheme.primary
                        : context.scheme.outline,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.kycTypeTitle, style: context.text.headlineSmall),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.kycTypeBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        choice(
          KycSubject.individual,
          Icons.person_rounded,
          l10n.kycIndividual,
          l10n.kycIndividualBody,
        ),
        const SizedBox(height: BlocksSpacing.md),
        choice(
          KycSubject.business,
          Icons.storefront_rounded,
          l10n.kycBusiness,
          l10n.kycBusinessBody,
        ),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.next,
          onPressed: () {
            // Prefill the name from the profile; the creator confirms it.
            if (_name.text.isEmpty) {
              final me = ref.read(currentUserProvider).value;
              if (me != null) _name.text = me.name;
            }
            _go(_Step.details);
          },
        ),
      ],
    );
  }

  Widget _detailsStep(BuildContext context, KycConfig cfg) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    final dobText = _dob == null ? '' : DateFormat.yMMMd(locale).format(_dob!);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            l10n.kycDetailsHeading,
            style: context.text.headlineSmall,
          ),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.kycDetailsBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(
            labelText: _isBusiness ? l10n.kycSignatoryName : l10n.kycLegalName,
            helperText: l10n.kycNameHelp,
            errorText: _errors.containsKey('legalName')
                ? _error('legalName')
                : null,
          ),
        ),
        if (!_isBusiness) ...[
          const SizedBox(height: BlocksSpacing.md),
          Semantics(
            button: true,
            label: dobText.isEmpty ? l10n.kycDob : '${l10n.kycDob}, $dobText',
            excludeSemantics: true,
            onTap: () => _pickDob(cfg),
            child: InkWell(
              borderRadius: BlocksRadius.mdAll,
              onTap: () => _pickDob(cfg),
              child: InputDecorator(
                isEmpty: dobText.isEmpty,
                decoration: InputDecoration(
                  labelText: l10n.kycDob,
                  helperText: l10n.kycDobHelp(cfg.minimumAge),
                  suffixIcon: const Icon(Icons.calendar_month_rounded),
                  errorText: _errors.containsKey('dateOfBirth')
                      ? _error('dateOfBirth')
                      : null,
                ),
                child: Text(dobText, style: context.text.bodyLarge),
              ),
            ),
          ),
        ],
        if (_isBusiness) ...[
          const SizedBox(height: BlocksSpacing.md),
          TextField(
            controller: _business,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: l10n.kycBusinessName,
              errorText: _errors.containsKey('businessName')
                  ? _error('businessName')
                  : null,
            ),
          ),
          if (cfg.businessTypes.isNotEmpty) ...[
            const SizedBox(height: BlocksSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _businessType,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: l10n.kycBusinessType,
                errorText: _errors.containsKey('businessType')
                    ? _error('businessType')
                    : null,
              ),
              items: [
                for (final t in cfg.businessTypes)
                  DropdownMenuItem(
                    value: t.id,
                    child: Text(t.label, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() {
                _businessType = v;
                _errors = Map.of(_errors)..remove('businessType');
              }),
            ),
          ],
        ],
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.next,
          onPressed: () => _continueFromDetails(cfg),
        ),
      ],
    );
  }

  Widget _documentsStep(BuildContext context, KycConfig cfg) {
    final l10n = context.l10n;
    final primaryTypes = cfg.documentsFor(_subject);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.kycDocsHeading, style: context.text.headlineSmall),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.kycDocsBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        _DocEditor(
          title: _isBusiness ? l10n.kycBusinessDoc : l10n.kycIdentityDoc,
          types: primaryTypes,
          form: _primary,
          config: cfg,
          errors: _errors,
          errorOf: _error,
          onChanged: () => setState(() {}),
        ),
        if (_isBusiness) ...[
          const SizedBox(height: BlocksSpacing.xl),
          _DocEditor(
            title: l10n.kycSignatoryDoc,
            types: cfg.signatoryDocuments,
            form: _signatory,
            config: cfg,
            errors: _errors,
            errorOf: _error,
            onChanged: () => setState(() {}),
          ),
        ],
        if (_errors.containsKey('document'))
          Padding(
            padding: const EdgeInsets.only(top: BlocksSpacing.md),
            child: StatusBanner.error(title: _error('document')),
          ),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.next,
          onPressed:
              _primary.front != null &&
                  _primary.typeId != null &&
                  (!_isBusiness ||
                      (_signatory.front != null && _signatory.typeId != null))
              ? () => _go(_Step.review)
              : null,
        ),
      ],
    );
  }

  Widget _reviewStep(BuildContext context, KycConfig cfg) {
    final l10n = context.l10n;
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: context.text.bodySmall),
          ),
          Expanded(child: Text(value, style: context.text.bodyMedium)),
        ],
      ),
    );

    Widget doc(String title, _DocForm f) {
      final type = f.typeId == null ? null : cfg.byId(f.typeId!);
      return Padding(
        padding: const EdgeInsets.only(top: BlocksSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: context.text.titleSmall),
            row(l10n.kycDocument, type?.label ?? ''),
            // Shown masked, even here: the full number is never displayed.
            row(
              type?.numberLabel ?? l10n.kycNumber,
              maskIdNumber(f.number.text),
            ),
            row(l10n.kycFile, f.front?.name ?? ''),
            if (f.back != null) row(l10n.kycFileBack, f.back!.name),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.kycReviewHeading, style: context.text.headlineSmall),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Text(l10n.kycReviewBody, style: context.text.bodyMedium),
        const SizedBox(height: BlocksSpacing.lg),
        Container(
          padding: const EdgeInsets.all(BlocksSpacing.lg),
          decoration: BoxDecoration(
            color: context.scheme.surface,
            borderRadius: BlocksRadius.xlAll,
            border: Border.all(color: context.scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              row(l10n.kycType, kycSubjectLabel(l10n, _subject)),
              row(
                _isBusiness ? l10n.kycSignatoryName : l10n.kycLegalName,
                _name.text.trim(),
              ),
              if (_isBusiness) row(l10n.kycBusinessName, _business.text.trim()),
              if (_isBusiness && _businessType != null)
                row(
                  l10n.kycBusinessType,
                  cfg.businessTypeById(_businessType!)?.label ?? '',
                ),
              if (!_isBusiness && _dob != null)
                row(
                  l10n.kycDob,
                  DateFormat.yMMMd(Localizations.localeOf(context).toString())
                      .format(_dob!),
                ),
              doc(
                _isBusiness ? l10n.kycBusinessDoc : l10n.kycIdentityDoc,
                _primary,
              ),
              if (_isBusiness) doc(l10n.kycSignatoryDoc, _signatory),
            ],
          ),
        ),
        const SizedBox(height: BlocksSpacing.md),
        StatusBanner.warning(title: l10n.kycReviewWarning),
        const SizedBox(height: BlocksSpacing.xl),
        BlocksButton(
          label: l10n.kycSubmit,
          icon: Icons.verified_user_rounded,
          isLoading: _submitting,
          onPressed: () => _submit(cfg),
        ),
      ],
    );
  }
}

/// One document: which kind, its number, and the picture(s).
class _DocEditor extends StatelessWidget {
  const _DocEditor({
    required this.title,
    required this.types,
    required this.form,
    required this.config,
    required this.errors,
    required this.errorOf,
    required this.onChanged,
  });

  final String title;
  final List<KycDocumentType> types;
  final _DocForm form;
  final KycConfig config;
  final Map<String, String> errors;
  final String Function(String key) errorOf;
  final VoidCallback onChanged;

  Future<void> _pick(BuildContext context, {required bool back}) async {
    final l10n = context.l10n;
    final picked = await showKycFileSheet(
      context,
      title: back ? l10n.kycUploadBack : l10n.kycUploadFront,
    );
    if (picked == null) return;
    if (back) {
      form.back = picked;
    } else {
      form.front = picked;
    }
    onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final type = form.typeId == null
        ? null
        : types.where((t) => t.id == form.typeId).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: context.text.titleMedium),
        ),
        const SizedBox(height: BlocksSpacing.xs),
        Wrap(
          spacing: BlocksSpacing.sm,
          children: [
            for (final t in types)
              PanelChip(
                label: t.label,
                selected: form.typeId == t.id,
                onTap: () {
                  form
                    ..typeId = t.id
                    ..back = null;
                  onChanged();
                },
              ),
          ],
        ),
        if (type != null) ...[
          const SizedBox(height: BlocksSpacing.md),
          TextField(
            controller: form.number,
            textCapitalization: TextCapitalization.characters,
            autocorrect: false,
            enableSuggestions: false,
            enableIMEPersonalizedLearning: false,
            onChanged: (_) => onChanged(),
            decoration: InputDecoration(
              labelText: type.numberLabel,
              hintText: type.numberHint,
              errorText: errors.containsKey('number')
                  ? errorOf('number')
                  : null,
            ),
          ),
          const SizedBox(height: BlocksSpacing.md),
          _FileTile(
            label: type.needsBackSide ? l10n.kycFront : l10n.kycUploadFront,
            file: form.front,
            onPick: () => _pick(context, back: false),
            onRemove: () {
              form.front = null;
              onChanged();
            },
          ),
          if (type.needsBackSide) ...[
            const SizedBox(height: BlocksSpacing.sm),
            _FileTile(
              label: l10n.kycBack,
              file: form.back,
              onPick: () => _pick(context, back: true),
              onRemove: () {
                form.back = null;
                onChanged();
              },
            ),
          ],
          if (errors.containsKey('file'))
            Padding(
              padding: const EdgeInsets.only(top: BlocksSpacing.sm),
              child: StatusBanner.error(title: errorOf('file')),
            ),
          Padding(
            padding: const EdgeInsets.only(top: BlocksSpacing.sm),
            child: Text(
              l10n.kycFileRules(
                config.maxFileMb,
                config.allowedFileTypes.map((e) => e.toUpperCase()).join(', '),
              ),
              style: context.text.bodySmall,
            ),
          ),
        ],
      ],
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({
    required this.label,
    required this.file,
    required this.onPick,
    required this.onRemove,
  });

  final String label;
  final KycFile? file;
  final VoidCallback onPick;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final f = file;
    return Semantics(
      container: true,
      label: f == null ? label : '$label: ${f.name}',
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: BlocksSpacing.md,
          vertical: BlocksSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: context.scheme.surface,
          borderRadius: BlocksRadius.lgAll,
          border: Border.all(color: context.scheme.outlineVariant),
        ),
        child: Row(
          children: [
            Icon(
              f == null
                  ? Icons.upload_file_rounded
                  : Icons.check_circle_rounded,
              color: f == null
                  ? context.scheme.outline
                  : context.blocks.success,
            ),
            const SizedBox(width: BlocksSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: context.text.labelMedium),
                  Text(
                    f == null
                        ? l10n.kycNoFile
                        : '${f.name} · ${(f.sizeBytes / 1024).round()} KB',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.bodyMedium,
                  ),
                ],
              ),
            ),
            if (f == null)
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(64, 48)),
                onPressed: onPick,
                child: Text(l10n.kycChoose),
              )
            else
              IconButton(
                tooltip: l10n.kycRemoveFile,
                onPressed: onRemove,
                icon: const Icon(Icons.close_rounded),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- status --

/// The live result. Polls while the review runs; the server decides.
class _StatusStep extends ConsumerWidget {
  const _StatusStep({required this.onDone});

  final VoidCallback onDone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final data = ref.watch(kycApplicationProvider);
    return data.when(
      loading: () => const LoadingView(),
      error: (err, _) => ErrorView(
        error: err,
        onRetry: () => ref.invalidate(kycApplicationProvider),
      ),
      data: (k) {
        final color = kycStatusColor(context, k.status);
        final working = k.status.isInProgress;
        return PollWhile(
          active: working,
          interval: const Duration(milliseconds: 1500),
          onTick: () {
            ref
              ..invalidate(kycApplicationProvider)
              ..invalidate(payoutOverviewProvider);
          },
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.xl),
            children: [
              Center(
                child: working
                    ? const SizedBox.square(
                        dimension: 88,
                        child: CircularProgressIndicator(strokeWidth: 6),
                      )
                    : Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.14),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          kycStatusIcon(k.status),
                          size: 52,
                          color: color,
                        ),
                      ),
              ),
              const SizedBox(height: BlocksSpacing.xl),
              Semantics(
                liveRegion: true,
                child: Text(
                  kycStatusLabel(l10n, k.status),
                  textAlign: TextAlign.center,
                  style: context.text.headlineMedium,
                ),
              ),
              const SizedBox(height: BlocksSpacing.sm),
              Text(
                kycStatusHint(l10n, k.status),
                textAlign: TextAlign.center,
                style: context.text.bodyLarge,
              ),
              if (k.status == KycStatus.rejected ||
                  k.status == KycStatus.actionRequired) ...[
                const SizedBox(height: BlocksSpacing.md),
                StatusBanner.error(title: kycReasonLabel(l10n, k.reasonCode)),
              ],
              const SizedBox(height: BlocksSpacing.xl),
              _Timeline(status: k.status),
              const SizedBox(height: BlocksSpacing.xl),
              if (working)
                StatusBanner(
                  kind: StatusKind.info,
                  title: l10n.kycProcessingNote,
                )
              else if (k.status.canSubmit)
                BlocksButton(
                  label: l10n.kycTryAgain,
                  icon: Icons.refresh_rounded,
                  onPressed: () => context.pushReplacement(Routes.kycFlow),
                ),
              const SizedBox(height: BlocksSpacing.sm),
              BlocksButton(
                label: l10n.done,
                variant: working || k.status.canSubmit
                    ? BlocksButtonVariant.tonal
                    : BlocksButtonVariant.primary,
                onPressed: onDone,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.status});

  final KycStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stage = switch (status) {
      KycStatus.notStarted => -1,
      KycStatus.pending => 0,
      KycStatus.underReview => 1,
      _ => 2,
    };
    final items = [
      l10n.kycStepReceived,
      l10n.kycStepReview,
      l10n.kycStepResult,
    ];
    return Column(
      children: [
        for (final (i, label) in items.indexed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                if (i < stage || (i == 2 && stage == 2))
                  Icon(
                    Icons.check_circle_rounded,
                    color: context.blocks.success,
                  )
                else if (i == stage)
                  const SizedBox.square(
                    dimension: 24,
                    child: Padding(
                      padding: EdgeInsets.all(2),
                      child: CircularProgressIndicator(strokeWidth: 2.6),
                    ),
                  )
                else
                  Icon(
                    Icons.radio_button_unchecked_rounded,
                    color: context.scheme.outline,
                  ),
                const SizedBox(width: BlocksSpacing.md),
                Expanded(child: Text(label, style: context.text.titleSmall)),
              ],
            ),
          ),
      ],
    );
  }
}
