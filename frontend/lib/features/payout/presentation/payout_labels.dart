import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/payout_models.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

// ------------------------------------------------------------------- KYC --

String kycStatusLabel(AppLocalizations l, KycStatus s) => switch (s) {
  KycStatus.notStarted => l.kycNotStarted,
  KycStatus.pending => l.kycPending,
  KycStatus.underReview => l.kycUnderReview,
  KycStatus.verified => l.kycVerified,
  KycStatus.rejected => l.kycRejected,
  KycStatus.actionRequired => l.kycActionRequired,
  KycStatus.expired => l.kycExpired,
};

IconData kycStatusIcon(KycStatus s) => switch (s) {
  KycStatus.notStarted => Icons.badge_outlined,
  KycStatus.pending => Icons.hourglass_top_rounded,
  KycStatus.underReview => Icons.manage_search_rounded,
  KycStatus.verified => Icons.verified_rounded,
  KycStatus.rejected => Icons.cancel_rounded,
  KycStatus.actionRequired => Icons.error_outline_rounded,
  KycStatus.expired => Icons.event_busy_rounded,
};

Color kycStatusColor(BuildContext c, KycStatus s) => switch (s) {
  KycStatus.verified => c.blocks.success,
  KycStatus.pending || KycStatus.underReview => c.scheme.primary,
  KycStatus.rejected => c.scheme.error,
  KycStatus.actionRequired || KycStatus.expired => c.blocks.warning,
  KycStatus.notStarted => c.scheme.outline,
};

String kycStatusHint(AppLocalizations l, KycStatus s) => switch (s) {
  KycStatus.notStarted => l.kycHintNotStarted,
  KycStatus.pending => l.kycHintPending,
  KycStatus.underReview => l.kycHintUnderReview,
  KycStatus.verified => l.kycHintVerified,
  KycStatus.rejected => l.kycHintRejected,
  KycStatus.actionRequired => l.kycHintActionRequired,
  KycStatus.expired => l.kycHintExpired,
};

String kycReasonLabel(AppLocalizations l, String? code) => switch (code) {
  'mismatch' => l.kycReasonMismatch,
  'unreadable' => l.kycReasonUnreadable,
  'blurry' => l.kycReasonBlurry,
  'expiredDocument' => l.kycReasonExpiredDocument,
  _ => l.kycReasonGeneric,
};

String kycSubjectLabel(AppLocalizations l, KycSubject s) =>
    s == KycSubject.individual ? l.kycIndividual : l.kycBusiness;

String kycDocStateLabel(AppLocalizations l, KycDocumentState s) => switch (s) {
  KycDocumentState.received => l.kycDocReceived,
  KycDocumentState.accepted => l.kycDocAccepted,
  KycDocumentState.rejected => l.kycDocRejected,
};

// ------------------------------------------------------------------ bank --

String bankStatusLabel(AppLocalizations l, BankVerificationStatus s) =>
    switch (s) {
      BankVerificationStatus.awaitingIdentity => l.bankAwaitingIdentity,
      BankVerificationStatus.verifying => l.bankVerifying,
      BankVerificationStatus.verified => l.bankVerified,
      BankVerificationStatus.nameMismatch => l.bankNameMismatch,
      BankVerificationStatus.failed => l.bankFailed,
    };

IconData bankStatusIcon(BankVerificationStatus s) => switch (s) {
  BankVerificationStatus.awaitingIdentity => Icons.hourglass_top_rounded,
  BankVerificationStatus.verifying => Icons.sync_rounded,
  BankVerificationStatus.verified => Icons.verified_rounded,
  BankVerificationStatus.nameMismatch => Icons.person_off_rounded,
  BankVerificationStatus.failed => Icons.error_outline_rounded,
};

Color bankStatusColor(BuildContext c, BankVerificationStatus s) => switch (s) {
  BankVerificationStatus.verified => c.blocks.success,
  BankVerificationStatus.awaitingIdentity ||
  BankVerificationStatus.verifying => c.scheme.primary,
  BankVerificationStatus.nameMismatch ||
  BankVerificationStatus.failed => c.scheme.error,
};

String bankStatusHint(AppLocalizations l, BankVerificationStatus s) =>
    switch (s) {
      BankVerificationStatus.awaitingIdentity => l.bankHintAwaitingIdentity,
      BankVerificationStatus.verifying => l.bankHintVerifying,
      BankVerificationStatus.verified => l.bankHintVerified,
      BankVerificationStatus.nameMismatch => l.bankHintNameMismatch,
      BankVerificationStatus.failed => l.bankHintFailed,
    };

String accountTypeLabel(AppLocalizations l, BankAccountType t) =>
    t == BankAccountType.savings ? l.bankSavings : l.bankCurrent;

// --------------------------------------------------------------- payouts --

String payoutStatusLabel(AppLocalizations l, PayoutStatus s) => switch (s) {
  PayoutStatus.requested => l.poRequested,
  PayoutStatus.processing => l.poProcessing,
  PayoutStatus.completed => l.poCompleted,
  PayoutStatus.failed => l.poFailed,
  PayoutStatus.reversed => l.poReversed,
  PayoutStatus.onHold => l.poOnHold,
};

IconData payoutStatusIcon(PayoutStatus s) => switch (s) {
  PayoutStatus.requested => Icons.schedule_send_rounded,
  PayoutStatus.processing => Icons.sync_rounded,
  PayoutStatus.completed => Icons.check_circle_rounded,
  PayoutStatus.failed => Icons.error_rounded,
  PayoutStatus.reversed => Icons.undo_rounded,
  PayoutStatus.onHold => Icons.pause_circle_rounded,
};

Color payoutStatusColor(BuildContext c, PayoutStatus s) => switch (s) {
  PayoutStatus.completed => c.blocks.success,
  PayoutStatus.requested || PayoutStatus.processing => c.scheme.primary,
  PayoutStatus.failed || PayoutStatus.reversed => c.scheme.error,
  PayoutStatus.onHold => c.blocks.warning,
};

String payoutReasonLabel(AppLocalizations l, String? code) => switch (code) {
  'bankRejected' => l.poReasonBankRejected,
  'bankReturned' => l.poReasonBankReturned,
  'securityReview' => l.poReasonSecurityReview,
  _ => l.poReasonGeneric,
};

String eligibilityLabel(
  AppLocalizations l,
  EligibilityCheck c, {
  required String minimum,
}) => switch (c) {
  EligibilityCheck.identityVerified => l.elIdentity,
  EligibilityCheck.bankVerified => l.elBank,
  EligibilityCheck.minimumBalance => l.elMinimum(minimum),
  EligibilityCheck.noActiveHold => l.elNoHold,
  EligibilityCheck.goodStanding => l.elStanding,
};

/// A small coloured pill with an icon and a word (colour is never the only
/// signal).
class StatusPill extends StatelessWidget {
  const StatusPill({
    required this.label,
    required this.icon,
    required this.color,
    super.key,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.labelMedium?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
