import 'package:equatable/equatable.dart';

/// Who is being verified.
enum KycSubject { individual, business }

enum KycStatus {
  /// Nothing submitted yet.
  notStarted,
  pending,
  underReview,
  verified,
  rejected,
  actionRequired,
  expired,
}

/// What the creator is told. Several internal states look the same to them.
extension KycStatusX on KycStatus {
  /// Submitted and waiting on the server / a reviewer.
  bool get isInProgress =>
      this == KycStatus.pending || this == KycStatus.underReview;

  bool get isVerified => this == KycStatus.verified;

  /// Whether the creator can (re)start the flow.
  bool get canSubmit => switch (this) {
    KycStatus.notStarted ||
    KycStatus.rejected ||
    KycStatus.actionRequired ||
    KycStatus.expired => true,
    _ => false,
  };

  /// The four states the payout screens show.
  KycStatus get summary => switch (this) {
    KycStatus.underReview => KycStatus.pending,
    KycStatus.expired => KycStatus.actionRequired,
    _ => this,
  };
}

/// One kind of document the server accepts. Which ones are accepted is
/// **server configuration**, not code: new document types or country rules
/// need no app release.
class KycDocumentType extends Equatable {
  const KycDocumentType({
    required this.id,
    required this.label,
    required this.numberLabel,
    this.numberPattern,
    this.numberHint = '',
    this.needsNumber = true,
    this.needsBackSide = false,
  });

  final String id;

  /// Shown to the user (the server localises it).
  final String label;
  final String numberLabel;

  /// A format hint for instant feedback only. The server decides validity.
  final String? numberPattern;
  final String numberHint;
  final bool needsNumber;
  final bool needsBackSide;

  /// Whether [input] looks like this document's number. Convenience only.
  bool looksValid(String input) {
    final pattern = numberPattern;
    if (!needsNumber) return true;
    final v = input.replaceAll(RegExp(r'[\s\-]'), '').toUpperCase();
    if (v.isEmpty) return false;
    return pattern == null || RegExp(pattern).hasMatch(v);
  }

  @override
  List<Object?> get props => [
    id,
    label,
    numberLabel,
    numberPattern,
    numberHint,
    needsNumber,
    needsBackSide,
  ];
}

/// One kind of business the verification provider accepts.
class KycBusinessType extends Equatable {
  const KycBusinessType({required this.id, required this.label});

  final String id;
  final String label;

  @override
  List<Object?> get props => [id, label];
}

/// Server-controlled verification rules.
class KycConfig extends Equatable {
  const KycConfig({
    required this.individualDocuments,
    required this.businessDocuments,
    required this.signatoryDocuments,
    this.businessTypes = const [],
    this.minimumAge = 18,
    this.maxFileMb = 5,
    this.allowedFileTypes = const ['jpg', 'png', 'pdf'],
    this.validity = const Duration(days: 365 * 2),
  });

  /// Identity documents an individual can use (any one).
  final List<KycDocumentType> individualDocuments;

  /// Registration / tax documents a business can use (any one).
  final List<KycDocumentType> businessDocuments;

  /// Identity documents for the person acting for a business (any one).
  final List<KycDocumentType> signatoryDocuments;

  /// The kinds of business the provider accepts. Empty means the provider
  /// does not ask.
  final List<KycBusinessType> businessTypes;

  /// Youngest age that may be verified for payouts. A compliance value, so it
  /// comes from the server and can differ by country.
  final int minimumAge;
  final int maxFileMb;
  final List<String> allowedFileTypes;

  /// How long a verification stays valid before it must be renewed.
  final Duration validity;

  List<KycDocumentType> documentsFor(KycSubject subject) =>
      subject == KycSubject.individual
      ? individualDocuments
      : businessDocuments;

  KycDocumentType? byId(String id) {
    for (final d in [
      ...individualDocuments,
      ...businessDocuments,
      ...signatoryDocuments,
    ]) {
      if (d.id == id) return d;
    }
    return null;
  }

  @override
  List<Object?> get props => [
    individualDocuments,
    businessDocuments,
    signatoryDocuments,
    businessTypes,
    minimumAge,
    maxFileMb,
    allowedFileTypes,
    validity,
  ];

  KycBusinessType? businessTypeById(String id) {
    for (final t in businessTypes) {
      if (t.id == id) return t;
    }
    return null;
  }
}

/// A file the user chose to upload. Only metadata lives in the app: the bytes
/// go straight to private, encrypted server storage and are **never kept on
/// the device** or reachable by a public URL.
class KycFile extends Equatable {
  const KycFile({required this.name, required this.sizeBytes});

  final String name;
  final int sizeBytes;

  String get extension {
    final dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  }

  @override
  List<Object?> get props => [name, sizeBytes];
}

/// What the creator typed for one document. Holds the **raw number** only
/// while the form is open and for the single submit call; it must never be
/// logged, stored or shown again. [toString] is redacted for that reason.
class KycDocumentInput {
  const KycDocumentInput({
    required this.typeId,
    required this.number,
    required this.file,
    this.backFile,
  });

  final String typeId;
  final String number;
  final KycFile file;
  final KycFile? backFile;

  @override
  String toString() => 'KycDocumentInput($typeId, <redacted>)';
}

class KycSubmission {
  const KycSubmission({
    required this.subject,
    required this.legalName,
    required this.documents,
    this.businessName = '',
    this.businessType = '',
    this.dateOfBirth,
  });

  final KycSubject subject;

  /// Full legal name as on the document (the person, or the signatory).
  final String legalName;
  final String businessName;

  /// A [KycBusinessType.id] from the server's list. Businesses only.
  final String businessType;

  /// Individuals only. Sent once and checked by the server; it is not shown
  /// again anywhere in the app.
  final DateTime? dateOfBirth;
  final List<KycDocumentInput> documents;

  @override
  String toString() =>
      'KycSubmission($subject, ${documents.length} document(s), <redacted>)';
}

enum KycDocumentState { received, accepted, rejected }

/// A submitted document as the server reports it: the number is **already
/// masked**.
class KycDocumentRecord extends Equatable {
  const KycDocumentRecord({
    required this.typeId,
    required this.label,
    required this.maskedNumber,
    required this.fileName,
    required this.uploadedAt,
    this.state = KycDocumentState.received,
  });

  final String typeId;
  final String label;
  final String maskedNumber;
  final String fileName;
  final DateTime uploadedAt;
  final KycDocumentState state;

  @override
  List<Object?> get props => [
    typeId,
    label,
    maskedNumber,
    fileName,
    uploadedAt,
    state,
  ];
}

/// The creator's verification as the server sees it. **The app only displays
/// this: it never decides, caches or flips a "verified" flag itself.**
class KycApplication extends Equatable {
  const KycApplication({
    required this.status,
    this.subject,
    this.legalName = '',
    this.businessName = '',
    this.businessType = '',
    this.documents = const [],
    this.submittedAt,
    this.reviewedAt,
    this.expiresAt,
    this.reasonCode,
  });

  const KycApplication.none() : this(status: KycStatus.notStarted);

  final KycStatus status;
  final KycSubject? subject;
  final String legalName;
  final String businessName;

  /// The business type as the server names it ("Private limited company").
  final String businessType;
  final List<KycDocumentRecord> documents;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final DateTime? expiresAt;

  /// Why it was rejected / what to fix (`blurry`, `mismatch`, `expiredDocument`,
  /// `unreadable`, ...). The app maps the code to words.
  final String? reasonCode;

  @override
  List<Object?> get props => [
    status,
    subject,
    legalName,
    businessName,
    businessType,
    documents,
    submittedAt,
    reviewedAt,
    expiresAt,
    reasonCode,
  ];
}
