import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/utils/id_mask.dart';
import 'package:blocks_app/data/mock/mock_creator_state.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/repositories/kyc_repository.dart';
import 'package:blocks_app/features/kyc/domain/kyc_form_validator.dart';

/// The mock identity-verification server.
///
/// It re-validates the form, **keeps only the masked number** (the raw number
/// is dropped the moment it is masked), and lets the review run on the clock.
/// Production hands the documents to a KYC provider from a private, encrypted
/// store and never returns a full number.
class MockKycRepository implements KycRepository {
  MockKycRepository(this._w);

  final MockWorld _w;
  MockCreatorState get _c => _w.creator;

  @override
  Future<KycApplication> getApplication() async {
    await _w.pause();
    return _c.kyc;
  }

  @override
  Future<KycApplication> submit(KycSubmission submission) async {
    await _w.pause();
    final current = _c.kyc;
    if (!current.status.canSubmit) {
      throw const ValidationFailure('alreadySubmitted');
    }

    final errors = KycFormValidator.validate(
      subject: submission.subject,
      legalName: submission.legalName,
      businessName: submission.businessName,
      documents: submission.documents,
      config: _c.kycConfig,
      now: _w.now(),
      dateOfBirth: submission.dateOfBirth,
      businessType: submission.businessType,
    );
    if (errors.isNotEmpty) throw FieldValidationFailure(errors);

    final now = _w.now();
    final records = <KycDocumentRecord>[];
    for (var i = 0; i < submission.documents.length; i++) {
      final input = submission.documents[i];
      final type = _c.kycConfig.byId(input.typeId)!;
      records.add(
        KycDocumentRecord(
          typeId: type.id,
          label: type.label,
          // Masked on arrival: the raw number is not kept anywhere.
          maskedNumber: maskIdNumber(input.number),
          fileName: input.file.name,
          uploadedAt: now,
        ),
      );
    }

    _c.kyc = KycApplication(
      status: KycStatus.pending,
      subject: submission.subject,
      legalName: submission.legalName.trim().replaceAll(RegExp(r'\s+'), ' '),
      businessName: submission.businessName.trim(),
      businessType:
          _c.kycConfig.businessTypeById(submission.businessType)?.label ?? '',
      documents: records,
      submittedAt: now,
    );
    _w.security.raise(SecurityEventType.identityDetailsChanged);
    return _c.kyc;
  }
}
