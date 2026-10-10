import 'package:blocks_app/app/router/routes.dart';
import 'package:blocks_app/core/errors/provider_retry.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;

/// Throws away everything the app holds for the person who was signed in.
///
/// Riverpod caches what it loads (the profile, feeds, likes, notifications). If
/// the next person to sign in on this phone found the previous person's data in
/// those caches, even for a moment, that would be a privacy failure. Signing out
/// (or the server ending the session) therefore replaces the whole provider
/// scope: every cache starts empty, and only what was deliberately persisted
/// (the onboarding flag, display settings) survives. Defaults to doing nothing,
/// so tests and the demo build are unaffected.
final sessionScopeResetProvider = Provider<void Function()>((_) => () {});

/// Where the router starts. The splash screen at launch; the sign-in screen
/// after a reset, so signing out does not replay the splash.
final initialLocationProvider = Provider<String>((_) => Routes.splash);

/// The app's [ProviderScope], which [sessionScopeResetProvider] can replace.
class SessionScope extends StatefulWidget {
  const SessionScope({required this.overrides, required this.child, super.key});

  /// Kept across a reset: the things that are the same for the next person
  /// (storage handles), not the data of the last one.
  final List<Override> overrides;
  final Widget child;

  @override
  State<SessionScope> createState() => _SessionScopeState();
}

class _SessionScopeState extends State<SessionScope> {
  int _generation = 0;

  void _reset() {
    if (mounted) setState(() => _generation++);
  }

  @override
  Widget build(BuildContext context) {
    return ProviderScope(
      // A new key is a new scope: the old one and every provider in it are
      // disposed.
      key: ValueKey(_generation),
      // Say what went wrong at once; see `providerRetry`.
      retry: providerRetry,
      overrides: [
        ...widget.overrides,
        sessionScopeResetProvider.overrideWithValue(_reset),
        if (_generation > 0)
          initialLocationProvider.overrideWithValue(Routes.auth),
      ],
      child: widget.child,
    );
  }
}
