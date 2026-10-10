import 'package:blocks_app/data/models/kyc_models.dart';

/// Checks for the verification form. Keys match `FieldValidationFailure`, so a
/// field refused by the server and one caught here are shown the same way.
///
/// The client check is a courtesy; the server validates everything again and
/// is the only authority on whether a document is genuine.
abstract final class KycFormValidator {
  static bool isValidName(String input) {
    final v = input.trim().replaceAll(RegExp(r'\s+'), ' ');
    return v.length >= 2 &&
        v.length <= 80 &&
        // \p{M}: vowel signs and viramas, which Hindi and Telugu names need.
        RegExp(r"^\p{L}[\p{L}\p{M}\s.'\-]*$", unicode: true).hasMatch(v);
  }

  /// Error code for [file] against [config], or null when it is acceptable.
  static String? checkFile(KycFile? file, KycConfig config) {
    if (file == null) return 'required';
    if (!config.allowedFileTypes.contains(file.extension)) return 'unsupported';
    if (file.sizeBytes > config.maxFileMb * 1024 * 1024) return 'tooLarge';
    if (file.sizeBytes <= 0) return 'unsupported';
    return null;
  }

  /// Whole years between [born] and [now].
  static int ageOn(DateTime born, DateTime now) {
    var years = now.year - born.year;
    final hadBirthday =
        now.month > born.month ||
        (now.month == born.month && now.day >= born.day);
    if (!hadBirthday) years--;
    return years;
  }

  /// `required`, `invalid` (in the future or implausibly old), `underage`, or
  /// null when [born] is acceptable for [config].
  static String? checkDateOfBirth(
    DateTime? born,
    DateTime now,
    KycConfig config,
  ) {
    if (born == null) return 'required';
    final age = ageOn(born, now);
    if (age < 0 || age > 120) return 'invalid';
    if (age < config.minimumAge) return 'underage';
    return null;
  }

  /// Empty when the form is acceptable.
  static Map<String, String> validate({
    required KycSubject subject,
    required String legalName,
    required String businessName,
    required List<KycDocumentInput> documents,
    required KycConfig config,
    required DateTime now,
    DateTime? dateOfBirth,
    String businessType = '',
  }) {
    final errors = <String, String>{};
    if (!isValidName(legalName)) errors['legalName'] = 'invalid';
    if (subject == KycSubject.individual) {
      final dob = checkDateOfBirth(dateOfBirth, now, config);
      if (dob != null) errors['dateOfBirth'] = dob;
    }
    if (subject == KycSubject.business) {
      if (businessName.trim().length < 2) errors['businessName'] = 'required';
      // Only asked when the provider publishes a list.
      if (config.businessTypes.isNotEmpty &&
          config.businessTypeById(businessType) == null) {
        errors['businessType'] = 'required';
      }
    }

    // An individual submits one identity document; a business submits a
    // registration document and the signatory's identity document.
    final needed = subject == KycSubject.individual ? 1 : 2;
    if (documents.length < needed) {
      errors['document'] = 'required';
      return errors;
    }

    for (var i = 0; i < documents.length; i++) {
      final input = documents[i];
      final allowed = subject == KycSubject.individual
          ? config.individualDocuments
          : (i == 0 ? config.businessDocuments : config.signatoryDocuments);
      final type = allowed.where((d) => d.id == input.typeId).firstOrNull;
      if (type == null) {
        errors['document'] = 'unsupported';
        continue;
      }
      if (!type.looksValid(input.number)) errors['number'] = 'invalid';
      final fileIssue = checkFile(input.file, config);
      if (fileIssue != null) errors['file'] = fileIssue;
      if (type.needsBackSide) {
        final back = checkFile(input.backFile, config);
        if (back != null) errors['file'] = back;
      }
    }
    return errors;
  }
}
