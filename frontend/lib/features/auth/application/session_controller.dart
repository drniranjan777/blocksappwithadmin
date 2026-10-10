import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:blocks_app/data/api/api_providers.dart';
import 'package:blocks_app/data/models/auth_models.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SessionState extends Equatable {
  const SessionState({
    required this.onboardingCompleted,
    required this.isSignedIn,
  });

  final bool onboardingCompleted;

  /// In the demo build this is the "Continue as Demo User" session.
  /// With the real API it is "has a session the server has not ended".
  final bool isSignedIn;

  @override
  List<Object?> get props => [onboardingCompleted, isSignedIn];
}

/// Owns app-entry state. The router redirects from this, so the rest of the
/// UI never asks "am I logged in?" — it just receives routes it may see.
class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    final auth = ref.read(authRepositoryProvider);
    // The server can end a session on its own (signed out from another device,
    // password changed, account suspended). Go back to sign-in when it does.
    final ended = ref.read(sessionEventsProvider).ended.listen((_) {
      _signedOut();
      _forgetEverything();
    });
    ref.onDispose(ended.cancel);
    return SessionState(
      onboardingCompleted: auth.hasCompletedOnboarding,
      isSignedIn: auth.isSignedIn,
    );
  }

  void _signedOut() {
    state = SessionState(
      onboardingCompleted: state.onboardingCompleted,
      isSignedIn: false,
    );
  }

  /// With the real service, drop every cache that held this person's data (see
  /// `sessionScopeResetProvider`). The swap happens in the next frame, not
  /// inside this call, so it is safe that this very provider is among the ones
  /// disposed.
  void _forgetEverything() {
    if (ref.read(appConfigProvider).useMockData) return;
    ref.read(sessionScopeResetProvider)();
  }

  Future<void> completeOnboarding() async {
    state = SessionState(
      onboardingCompleted: true,
      isSignedIn: state.isSignedIn,
    );
    await ref.read(authRepositoryProvider).completeOnboarding();
  }

  /// "Explore Demo" / "Continue as Demo User".
  Future<void> startDemoSession() async {
    state = const SessionState(onboardingCompleted: true, isSignedIn: true);
    await ref.read(authRepositoryProvider).signInAsDemo();
  }

  /// Password sign-in. The server counts failures and applies protection;
  /// the session only opens when it answers [LoginSucceeded].
  Future<LoginResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    final result = await ref
        .read(authRepositoryProvider)
        .signInWithPassword(identifier: identifier, password: password);
    if (result is LoginSucceeded) _opened();
    return result;
  }

  /// Creates an account; the server sends a code to confirm it.
  Future<CodeChallenge> register(RegistrationRequest request) =>
      ref.read(authRepositoryProvider).register(request);

  /// Answers a pending code step; the session opens when the server accepts it.
  Future<void> submitCode(
    CodeChallenge challenge,
    String code, {
    SignInCodeMethod method = SignInCodeMethod.otp,
  }) async {
    await ref
        .read(authRepositoryProvider)
        .submitCode(challenge, code, method: method);
    _opened();
  }

  Future<CodeChallenge> resendCode(CodeChallenge challenge) =>
      ref.read(authRepositoryProvider).resendCode(challenge);

  void _opened() {
    state = const SessionState(onboardingCompleted: true, isSignedIn: true);
  }

  Future<void> signOut() async {
    _signedOut();
    await ref.read(authRepositoryProvider).signOut();
    _forgetEverything();
  }
}

final sessionControllerProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
