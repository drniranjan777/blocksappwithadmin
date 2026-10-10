import 'package:blocks_app/core/errors/app_failure.dart';

/// When a failed provider is run again by itself, and when it is not.
///
/// Riverpod's default retries *every* failure up to ten times, backing off to 6.4 seconds, and
/// shows "loading" the whole time. For a failure that cannot succeed (a feature that is not
/// available, a refused request, a missing record) that is ~38 seconds of spinner before the
/// person sees any message, and ten identical requests to the server. Every screen already has a
/// visible "Try again", so the default here is to say what went wrong at once.
///
/// Only the two failures that are about the moment, not the request, are tried again, briefly:
/// the phone could not reach the server, or the server said it was busy. (The HTTP client also
/// retries reads on its own, so this is a short second chance, not a loop.)
Duration? providerRetry(int retryCount, Object error) {
  if (retryCount >= 2) return null;
  if (error is NetworkFailure) {
    return Duration(milliseconds: 800 * (retryCount + 1));
  }
  if (error is ServiceUnavailableFailure) {
    final asked = error.retryAfter;
    final wait = asked ?? Duration(seconds: retryCount + 1);
    // Never make someone stare at a spinner for long: anything slower is theirs to retry.
    return wait > const Duration(seconds: 4) ? null : wait;
  }
  return null;
}
