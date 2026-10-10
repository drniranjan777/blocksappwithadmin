import 'package:equatable/equatable.dart';

/// Domain-level failure surfaced to the UI. Repositories translate transport
/// errors (HTTP, cache, parsing) into one of these so screens never depend on
/// a networking library.
///
/// A failure that came from the API also carries the server's stable error
/// [code] (`OTP_INVALID`, `ACCOUNT_LOCKED`, ...) and any [details] that go with
/// it (`attemptsRemaining`, `until`). Screens branch on the type first and use
/// the code only when one cause needs its own wording. [message] is the
/// server's text (or the default) and is never shown to the user as-is for a
/// 5xx.
sealed class AppFailure extends Equatable implements Exception {
  const AppFailure(this.message, [this.code, this.details = const {}]);

  final String message;
  final String? code;
  final Map<String, Object?> details;

  @override
  List<Object?> get props => [message, code, details];
}

class NetworkFailure extends AppFailure {
  const NetworkFailure([super.message = 'No connection', super.code]);
}

class NotFoundFailure extends AppFailure {
  const NotFoundFailure([
    super.message = 'Not found',
    super.code,
    super.details,
  ]);
}

class UnauthorizedFailure extends AppFailure {
  const UnauthorizedFailure([
    super.message = 'Please sign in again',
    super.code,
    super.details,
  ]);
}

class ValidationFailure extends AppFailure {
  const ValidationFailure(super.message, [super.code, super.details]);
}

/// One or more form fields were refused. Keys are the field names the server
/// uses (`name`, `username`, `bio`, ...) and values a short reason code.
/// Never trust that the client already checked these: the server always does.
class FieldValidationFailure extends AppFailure {
  const FieldValidationFailure(this.errors) : super('validation');

  final Map<String, String> errors;

  @override
  List<Object?> get props => [message, errors];
}

class UnknownFailure extends AppFailure {
  const UnknownFailure([super.message = 'Unexpected error', super.code]);
}

/// The server understood the request but will not do it for this person
/// (HTTP 403). The message is the server's own explanation when it gave one.
class ForbiddenFailure extends AppFailure {
  const ForbiddenFailure([
    super.message = 'You do not have permission to do that',
    super.code,
    super.details,
  ]);
}

/// The request clashes with the current state (HTTP 409/412): already done,
/// changed by someone else, or the same idempotency key with a different body.
class ConflictFailure extends AppFailure {
  const ConflictFailure([
    super.message = 'That is already in use or has changed',
    super.code,
    super.details,
  ]);
}

/// Too many requests (HTTP 429). [retryAfter] is the server's own wait, if given.
class RateLimitedFailure extends AppFailure {
  const RateLimitedFailure({
    this.retryAfter,
    String message = 'Too many attempts',
    String? code,
    Map<String, Object?> details = const {},
  }) : super(message, code, details);

  final Duration? retryAfter;

  @override
  List<Object?> get props => [message, code, details, retryAfter];
}

/// The service is busy or down for a moment (HTTP 502/503/504). Asking again
/// shortly usually works; nothing was changed.
class ServiceUnavailableFailure extends AppFailure {
  const ServiceUnavailableFailure({
    this.retryAfter,
    String message = 'The service is busy. Please try again in a moment',
    String? code,
  }) : super(message, code);

  final Duration? retryAfter;

  @override
  List<Object?> get props => [message, code, retryAfter];
}
