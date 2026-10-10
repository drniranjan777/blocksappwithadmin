import 'package:equatable/equatable.dart';

/// How a one-time or recovery code can be given to the server.
enum SignInCodeMethod {
  /// A 6-digit code sent to the person's e-mail or phone.
  otp('otp'),

  /// A 6-digit code from the person's authenticator app.
  totp('totp'),

  /// One of the single-use recovery codes issued when two-step sign-in was set up.
  backupCode('backup_code');

  const SignInCodeMethod(this.wire);

  /// The name the API uses for it.
  final String wire;

  static SignInCodeMethod? fromWire(String value) {
    for (final m in values) {
      if (m.wire == value) return m;
    }
    return null;
  }
}

/// Why the server is asking for a code.
enum CodeChallengeKind {
  /// A new account: prove the e-mail or phone belongs to you.
  contactVerification,

  /// The account uses two-step sign-in.
  secondFactor,

  /// The password was right but the sign-in looked unusual (new place or device).
  unusualSignIn,
}

/// A pending "enter your code" step. Holds only what the server handed out to
/// continue it: never a password, never a code.
class CodeChallenge extends Equatable {
  const CodeChallenge({
    required this.id,
    required this.kind,
    this.methods = const [SignInCodeMethod.otp],
    this.destinationMasked,
    this.resendAvailableAt,
  });

  final String id;
  final CodeChallengeKind kind;

  /// What can answer it. A challenge whose only methods are an authenticator
  /// app and recovery codes sends nothing, so there is nothing to resend.
  final List<SignInCodeMethod> methods;

  /// Where a code was sent, already masked by the server (`a***@example.com`).
  final String? destinationMasked;

  /// Earliest time a new code may be requested.
  final DateTime? resendAvailableAt;

  bool get canResend => methods.contains(SignInCodeMethod.otp);

  CodeChallenge copyWith({DateTime? resendAvailableAt}) => CodeChallenge(
    id: id,
    kind: kind,
    methods: methods,
    destinationMasked: destinationMasked,
    resendAvailableAt: resendAvailableAt ?? this.resendAvailableAt,
  );

  @override
  List<Object?> get props => [
    id,
    kind,
    methods,
    destinationMasked,
    resendAvailableAt,
  ];
}

/// What the create-account form submits. The server checks every field again,
/// including the minimum age.
class RegistrationRequest extends Equatable {
  const RegistrationRequest({
    required this.username,
    required this.displayName,
    required this.password,
    required this.dateOfBirth,
    this.email,
    this.phone,
    this.state,
    this.district,
    this.language,
  });

  final String username;
  final String displayName;
  final String password;
  final DateTime dateOfBirth;
  final String? email;
  final String? phone;
  final String? state;
  final String? district;
  final String? language;

  /// Never prints the password.
  @override
  String toString() => 'RegistrationRequest(username: $username)';

  @override
  List<Object?> get props => [
    username,
    displayName,
    password,
    dateOfBirth,
    email,
    phone,
    state,
    district,
    language,
  ];
}
