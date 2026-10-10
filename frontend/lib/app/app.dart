import 'package:blocks_app/app/router/app_router.dart';
import 'package:blocks_app/app/theme/app_theme.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class BlocksApp extends ConsumerWidget {
  const BlocksApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    // Only theme and language rebuild the app shell, not every preference.
    final themeMode = ref.watch(appSettingsProvider.select((s) => s.themeMode));
    final locale = ref.watch(appSettingsProvider.select((s) => s.locale));

    return MaterialApp.router(
      title: 'BLOCKS',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
