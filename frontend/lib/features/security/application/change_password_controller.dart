import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Why the server refused a password change.
enum PasswordChangeError { wrongCurrent, weak, same, other }

class ChangePasswordState extends Equatable {
  const ChangePasswordState({
    this.submitting = false,
    this.error,
    this.succeeded = false,
  });

  final bool submitting;
  final PasswordChangeError? error;
  final bool succeeded;

  @override
  List<Object?> get props => [submitting, error, succeeded];
}

/// Drives the Change Password screen. The server owns the rules; this only
/// sends the request and translates its reason into something displayable.
class ChangePasswordController extends Notifier<ChangePasswordState> {
  @override
  ChangePasswordState build() => const ChangePasswordState();

  Future<bool> submit({
    required String currentPassword,
    required String newPassword,
  }) async {
    if (state.submitting) return false;
    state = const ChangePasswordState(submitting: true);
    try {
      await ref
          .read(passwordRepositoryProvider)
          .changePassword(
            currentPassword: currentPassword,
            newPassword: newPassword,
          );
      refreshSecurityFrom(ref);
      state = const ChangePasswordState(succeeded: true);
      return true;
    } on ValidationFailure catch (f) {
      state = ChangePasswordState(
        error: switch (f.message) {
          'wrongCurrentPassword' => PasswordChangeError.wrongCurrent,
          'weakPassword' => PasswordChangeError.weak,
          'samePassword' => PasswordChangeError.same,
          _ => PasswordChangeError.other,
        },
      );
    } on Object {
      state = const ChangePasswordState(error: PasswordChangeError.other);
    }
    return false;
  }

  void clearError() {
    if (state.error != null) state = const ChangePasswordState();
  }
}

final changePasswordControllerProvider =
    NotifierProvider.autoDispose<ChangePasswordController, ChangePasswordState>(
      ChangePasswordController.new,
    );
