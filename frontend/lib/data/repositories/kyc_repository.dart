import 'package:blocks_app/data/models/kyc_models.dart';

/// Identity (KYC) verification.
///
/// **What the app does:** collect the form, send it, show the result.
/// **What the app never does:** verify an identity, decide a status, keep a
/// document, or remember a full ID number. Verification is done by a KYC
/// provider behind the BLOCKS backend; documents live in encrypted, private
/// storage reachable only by signed, short-lived URLs and role-restricted
/// reviewers, with an audit log and a retention policy. All of that is
/// server-side.
abstract interface class KycRepository {
  /// Current verification. Poll while it is in progress.
  Future<KycApplication> getApplication();

  /// Submits the form. Throws `FieldValidationFailure` for refused fields
  /// (keys: `legalName`, `businessName`, `document`, `number`, `file`).
  /// Never logs or stores the raw numbers in [submission].
  Future<KycApplication> submit(KycSubmission submission);
}
