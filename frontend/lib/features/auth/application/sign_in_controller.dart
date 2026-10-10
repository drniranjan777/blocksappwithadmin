import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/features/auth/application/session_controller.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SignInState extends Equatable {
  const SignInState({
    this.submitting = false,
    this.result,
    this.failed = false,
  });

  final bool submitting;

  /// The server's last answer. The app holds no attempt counter of its own;
  /// anything it shows about attempts came from here.
  final LoginResult? result;

  /// A network / unexpected failure (not a wrong password).
  final bool failed;

  bool get isProtected => result is LoginProtected;

  @override
  List<Object?> get props => [submitting, failed, _key(result)];

  /// [LoginResult]s are not value types; compare the parts that matter.
  static Object? _key(LoginResult? r) => switch (r) {
    null => null,
    LoginSucceeded(:final isNewDevice) => ('ok', isNewDevice),
    LoginNeedsCode(:final challenge) => ('code', challenge),
    LoginRejected(:final attemptsRemaining) => ('no', attemptsRemaining),
    LoginProtected(:final retryAt, :final justTriggered) => (
      'protected',
      retryAt,
      justTriggered,
    ),
  };
}

/// Password sign-in. Everything that decides the outcome (credentials, the
/// failure count, temporary protection) happens on the server; this only sends
/// the request and holds the answer.
class SignInController extends Notifier<SignInState> {
  @override
  SignInState build() => const SignInState();

  /// Returns true when the session opened.
  Future<bool> submit({
    required String identifier,
    required String password,
  }) async {
    if (state.submitting) return false;
    state = const SignInState(submitting: true);
    try {
      final result = await ref
          .read(sessionControllerProvider.notifier)
          .signInWithPassword(
            identifier: identifier.trim(),
            password: password,
          );
      state = SignInState(result: result);
      return result is LoginSucceeded;
    } on Object {
      state = const SignInState(failed: true);
      return false;
    }
  }

  void clearError() {
    if (state.result is LoginRejected || state.failed) {
      state = const SignInState();
    }
  }
}

final signInControllerProvider =
    NotifierProvider.autoDispose<SignInController, SignInState>(
      SignInController.new,
    );
