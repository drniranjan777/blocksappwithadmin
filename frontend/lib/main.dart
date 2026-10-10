import 'package:blocks_app/app/app.dart';
import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/app/session_scope.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/api/api_providers.dart';
import 'package:blocks_app/data/api/device_identity.dart';
import 'package:blocks_app/data/api/token_store.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _boundImageMemory();
  final prefs = await SharedPreferences.getInstance();
  final config = AppConfig.fromEnvironment();

  final overrides = [
    localStoreProvider.overrideWithValue(SharedPrefsLocalStore(prefs)),
  ];
  if (!config.useMockData) {
    try {
      // A wrong API_BASE_URL is caught here, before anything is sent anywhere.
      config.apiBaseUri;
    } on StateError catch (e) {
      runApp(_ConfigurationError(message: e.message));
      return;
    }
    // The session and this install's id are read from the Keychain / Keystore
    // once, so the router can ask "am I signed in?" without waiting.
    overrides
      ..add(tokenStoreProvider.overrideWithValue(await SecureTokenStore.open()))
      ..add(
        deviceIdStoreProvider.overrideWithValue(
          await SecureDeviceIdStore.open(),
        ),
      );
  }

  runApp(SessionScope(overrides: overrides, child: const BlocksApp()));
}

/// Shown instead of the app when the build was configured wrongly (for a
/// developer, not a user, so it is not translated).
class _ConfigurationError extends StatelessWidget {
  const _ConfigurationError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text('BLOCKS cannot start.\n\n$message')),
          ),
        ),
      ),
    );
  }
}

/// Flutter's default decoded-image cache (1000 images / 100 MB) is generous
/// for a feed that scrolls for hours on a budget phone. Keep it tight: the
/// feed only ever shows a handful of thumbnails at once, and evicted images
/// are cheap to re-decode from the disk cache.
void _boundImageMemory() {
  final cache = PaintingBinding.instance.imageCache;
  cache.maximumSize = 150;
  cache.maximumSizeBytes = 80 << 20; // 80 MB
}
