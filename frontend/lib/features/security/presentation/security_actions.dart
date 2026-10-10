import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/app_snack.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/security/application/security_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// "Log out of all other devices?" -> revoke every session except this one.
///
/// In production the server revokes the refresh tokens; the app only asks.
Future<void> confirmLogoutOtherDevices(
  BuildContext context,
  WidgetRef ref,
) async {
  final l10n = context.l10n;
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(l10n.secLogoutOthersTitle),
      content: Text(l10n.secLogoutOthersBody),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(d).pop(false),
          child: Text(l10n.cancel),
        ),
        TextButton(
          onPressed: () => Navigator.of(d).pop(true),
          style: TextButton.styleFrom(foregroundColor: d.scheme.error),
          child: Text(l10n.secLogoutOthersConfirm),
        ),
      ],
    ),
  );
  if (!(ok ?? false)) return;
  await ref.read(sessionRepositoryProvider).revokeAllOtherSessions();
  refreshSecurity(ref);
  if (context.mounted) showAppSnack(context, l10n.secLogoutOthersDone);
}
