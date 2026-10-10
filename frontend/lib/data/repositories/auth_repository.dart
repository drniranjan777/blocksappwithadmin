import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';

/// Entry/session contract. Demo: flags in local storage. Production: token
/// exchange with the auth service (tokens go to secure storage, never prefs).
abstract interface class AuthRepository {
  bool get hasCompletedOnboarding;
  bool get isSignedIn;

  Future<void> completeOnboarding();
  Future<void> signInAsDemo();

  /// Password sign-in. The server counts failures and decides when to apply
  /// temporary protection; the app only receives the [LoginResult].
  Future<LoginResult> signInWithPassword({
    required String identifier,
    required String password,
  });

  /// Creates an account and asks for the code sent to its e-mail or phone.
  /// The server answers the same way whether or not that address already has
  /// an account, so this never reveals which.
  Future<CodeChallenge> register(RegistrationRequest request);

  /// Answers a pending [CodeChallenge] (from [register] or from a
  /// [LoginNeedsCode] result) and opens the session.
  ///
  /// Throws `ValidationFailure` with code `OTP_INVALID` (and `attemptsLeft` in
  /// its details) for a wrong code, `OTP_EXPIRED` once it has lapsed, and
  /// `RateLimitedFailure` with code `OTP_LOCKED` after too many wrong ones.
  Future<LoginSucceeded> submitCode(
    CodeChallenge challenge,
    String code, {
    SignInCodeMethod method = SignInCodeMethod.otp,
  });

  /// Asks for a new code for [challenge]; the returned challenge says when
  /// another may be requested.
  Future<CodeChallenge> resendCode(CodeChallenge challenge);

  Future<void> signOut();
}
