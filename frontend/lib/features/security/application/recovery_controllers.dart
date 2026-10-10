import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Reasons a step can fail, as the UI needs to show them.
enum FlowError {
  invalidEmail,
  invalidPhone,
  wrongPassword,
  sameValue,
  weakPassword,
  tooManyAttempts,
  expired,
  other,
}

FlowError _errorFor(Object e) {
  if (e is ValidationFailure) {
    return switch (e.message) {
      'invalidEmail' => FlowError.invalidEmail,
      'invalidPhone' => FlowError.invalidPhone,
      'wrongPassword' || 'wrongCurrentPassword' => FlowError.wrongPassword,
      'sameValue' => FlowError.sameValue,
      'weakPassword' => FlowError.weakPassword,
      'tooManyAttempts' => FlowError.tooManyAttempts,
      _ => FlowError.other,
    };
  }
  if (e is UnauthorizedFailure) return FlowError.expired;
  return FlowError.other;
}

// ------------------------------------------------------- forgot password --

enum ResetStep { method, destination, code, password, done }

class ResetState extends Equatable {
  const ResetState({
    this.step = ResetStep.method,
    this.channel,
    this.challenge,
    this.token,
    this.submitting = false,
    this.error,
  });

  final ResetStep step;
  final OtpChannel? channel;
  final OtpChallenge? challenge;

  /// Single-use proof from the server that the code was right.
  final String? token;
  final bool submitting;
  final FlowError? error;

  ResetState copyWith({
    ResetStep? step,
    OtpChannel? channel,
    OtpChallenge? challenge,
    String? token,
    bool? submitting,
    FlowError? error,
    bool clearError = false,
  }) => ResetState(
    step: step ?? this.step,
    channel: channel ?? this.channel,
    challenge: challenge ?? this.challenge,
    token: token ?? this.token,
    submitting: submitting ?? this.submitting,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    step,
    channel,
    challenge,
    token,
    submitting,
    error,
  ];
}

/// "Forgot password": choose e-mail or phone -> destination -> code -> new
/// password -> done. The server issues, counts and checks the codes.
class ResetPasswordController extends Notifier<ResetState> {
  @override
  ResetState build() => const ResetState();

  void chooseChannel(OtpChannel channel) {
    state = ResetState(step: ResetStep.destination, channel: channel);
  }

  /// Step back one stage (or return false when already at the start).
  bool back() {
    final previous = switch (state.step) {
      ResetStep.method || ResetStep.done => null,
      ResetStep.destination => ResetStep.method,
      ResetStep.code => ResetStep.destination,
      ResetStep.password => ResetStep.code,
    };
    if (previous == null) return false;
    state = ResetState(step: previous, channel: state.channel);
    return true;
  }

  Future<void> sendCode(String destination) async {
    final channel = state.channel;
    if (channel == null || state.submitting) return;
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final challenge = await ref
          .read(passwordResetRepositoryProvider)
          .startReset(channel: channel, destination: destination);
      state = ResetState(
        step: ResetStep.code,
        channel: channel,
        challenge: challenge,
      );
    } on Object catch (e) {
      state = state.copyWith(submitting: false, error: _errorFor(e));
    }
  }

  Future<OtpResult> verifyCode(String code) async {
    final challenge = state.challenge!;
    final result = await ref
        .read(passwordResetRepositoryProvider)
        .verifyCode(challengeId: challenge.id, code: code);
    if (result is OtpVerified) {
      state = ResetState(
        step: ResetStep.password,
        channel: state.channel,
        challenge: challenge,
        token: result.token,
      );
    }
    return result;
  }

  Future<OtpChallenge> resend() async {
    final fresh = await ref
        .read(passwordResetRepositoryProvider)
        .resendCode(state.challenge!.id);
    state = state.copyWith(challenge: fresh);
    return fresh;
  }

  Future<bool> complete(String newPassword) async {
    final token = state.token;
    if (token == null || state.submitting) return false;
    state = state.copyWith(submitting: true, clearError: true);
    try {
      await ref
          .read(passwordResetRepositoryProvider)
          .completeReset(token: token, newPassword: newPassword);
      refreshSecurityFrom(ref);
      state = const ResetState(step: ResetStep.done);
      return true;
    } on Object catch (e) {
      state = state.copyWith(submitting: false, error: _errorFor(e));
      return false;
    }
  }

  void clearError() {
    if (state.error != null) state = state.copyWith(clearError: true);
  }
}

final resetPasswordControllerProvider =
    NotifierProvider.autoDispose<ResetPasswordController, ResetState>(
      ResetPasswordController.new,
    );

// ---------------------------------------------------- change e-mail/phone --

enum ContactStep { form, code, confirm, done }

class ContactChangeState extends Equatable {
  const ContactChangeState({
    this.step = ContactStep.form,
    this.challenge,
    this.token,
    this.newValue = '',
    this.submitting = false,
    this.error,
  });

  final ContactStep step;
  final OtpChallenge? challenge;
  final String? token;

  /// What the user typed, kept only to show in the confirmation step.
  final String newValue;
  final bool submitting;
  final FlowError? error;

  ContactChangeState copyWith({
    ContactStep? step,
    OtpChallenge? challenge,
    String? token,
    String? newValue,
    bool? submitting,
    FlowError? error,
    bool clearError = false,
  }) => ContactChangeState(
    step: step ?? this.step,
    challenge: challenge ?? this.challenge,
    token: token ?? this.token,
    newValue: newValue ?? this.newValue,
    submitting: submitting ?? this.submitting,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    step,
    challenge,
    token,
    newValue,
    submitting,
    error,
  ];
}

/// Changing a sensitive identifier is never a single tap: current password ->
/// code sent to the NEW address -> explicit confirmation. Only then does the
/// server apply it (and alert the old address).
class ContactChangeController extends Notifier<ContactChangeState> {
  ContactChangeController(this.channel);

  final OtpChannel channel;

  @override
  ContactChangeState build() => const ContactChangeState();

  Future<void> start({
    required String newValue,
    required String currentPassword,
  }) async {
    if (state.submitting) return;
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final challenge = await ref
          .read(securityRepositoryProvider)
          .startContactChange(
            channel: channel,
            newValue: newValue,
            currentPassword: currentPassword,
          );
      state = ContactChangeState(
        step: ContactStep.code,
        challenge: challenge,
        newValue: newValue.trim(),
      );
    } on Object catch (e) {
      state = state.copyWith(submitting: false, error: _errorFor(e));
    }
  }

  Future<OtpResult> verifyCode(String code) async {
    final challenge = state.challenge!;
    final result = await ref
        .read(securityRepositoryProvider)
        .verifyContactChange(challengeId: challenge.id, code: code);
    if (result is OtpVerified) {
      if (result.applied) {
        // The live service has already made the change: nothing left to confirm.
        refreshSecurityFrom(ref);
        state = ContactChangeState(
          step: ContactStep.done,
          newValue: state.newValue,
        );
      } else {
        state = ContactChangeState(
          step: ContactStep.confirm,
          challenge: challenge,
          token: result.token,
          newValue: state.newValue,
        );
      }
    }
    return result;
  }

  Future<OtpChallenge> resend() async {
    final fresh = await ref
        .read(securityRepositoryProvider)
        .resendContactChangeCode(state.challenge!.id);
    state = state.copyWith(challenge: fresh);
    return fresh;
  }

  Future<bool> confirm() async {
    final token = state.token;
    if (token == null || state.submitting) return false;
    state = state.copyWith(submitting: true, clearError: true);
    try {
      await ref
          .read(securityRepositoryProvider)
          .confirmContactChange(token: token);
      refreshSecurityFrom(ref);
      state = ContactChangeState(
        step: ContactStep.done,
        newValue: state.newValue,
      );
      return true;
    } on Object catch (e) {
      state = state.copyWith(submitting: false, error: _errorFor(e));
      return false;
    }
  }

  void clearError() {
    if (state.error != null) state = state.copyWith(clearError: true);
  }
}

final contactChangeControllerProvider = NotifierProvider.autoDispose
    .family<ContactChangeController, ContactChangeState, OtpChannel>(
      ContactChangeController.new,
    );
