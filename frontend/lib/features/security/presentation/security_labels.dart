import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';
import 'package:flutter/material.dart';

String securityEventTitle(AppLocalizations l, SecurityEventType type) =>
    switch (type) {
      SecurityEventType.loginSuccess => l.evLoginSuccess,
      SecurityEventType.loginFailed => l.evLoginFailed,
      SecurityEventType.suspiciousLogin => l.evSuspicious,
      SecurityEventType.passwordChanged => l.evPasswordChanged,
      SecurityEventType.emailChanged => l.evEmailChanged,
      SecurityEventType.phoneChanged => l.evPhoneChanged,
      SecurityEventType.twoFactorEnabled => l.evTwoFactorOn,
      SecurityEventType.twoFactorDisabled => l.evTwoFactorOff,
      SecurityEventType.sessionRevoked => l.evSessionRevoked,
      SecurityEventType.payoutAccountChanged => l.evPayoutAccountChanged,
      SecurityEventType.identityDetailsChanged => l.evIdentityChanged,
    };

IconData securityEventIcon(SecurityEventType type) => switch (type) {
  SecurityEventType.loginSuccess => Icons.check_circle_rounded,
  SecurityEventType.loginFailed => Icons.error_outline_rounded,
  SecurityEventType.suspiciousLogin => Icons.warning_amber_rounded,
  SecurityEventType.passwordChanged => Icons.password_rounded,
  SecurityEventType.emailChanged => Icons.alternate_email_rounded,
  SecurityEventType.phoneChanged => Icons.phone_android_rounded,
  SecurityEventType.twoFactorEnabled => Icons.verified_user_rounded,
  SecurityEventType.twoFactorDisabled => Icons.shield_outlined,
  SecurityEventType.sessionRevoked => Icons.devices_other_rounded,
  SecurityEventType.payoutAccountChanged => Icons.account_balance_rounded,
  SecurityEventType.identityDetailsChanged => Icons.badge_rounded,
};

/// Colour conveys severity but is never the only signal: every event also has
/// its own icon and title.
Color securityStatusColor(BuildContext context, SecurityEventStatus status) =>
    switch (status) {
      SecurityEventStatus.success => context.blocks.success,
      SecurityEventStatus.failed => context.blocks.warning,
      SecurityEventStatus.suspicious => context.scheme.error,
      SecurityEventStatus.info => context.scheme.primary,
    };

IconData devicePlatformIcon(String platform) =>
    switch (platform.toLowerCase()) {
      'android' => Icons.phone_android_rounded,
      'ios' => Icons.phone_iphone_rounded,
      'windows' || 'macos' || 'linux' => Icons.laptop_rounded,
      'web' => Icons.language_rounded,
      _ => Icons.devices_other_rounded,
    };

/// "8:42 PM" in the user's locale and 12/24 h setting.
String formatClock(BuildContext context, DateTime t) =>
    MaterialLocalizations.of(context)
        .formatTimeOfDay(TimeOfDay.fromDateTime(t));

bool isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// "Today" / "Yesterday" / "8 Oct 2026".
String dayLabel(BuildContext context, DateTime day, DateTime now) {
  final l10n = context.l10n;
  if (isSameDay(day, now)) return l10n.actToday;
  if (isSameDay(day, now.subtract(const Duration(days: 1)))) {
    return l10n.actYesterday;
  }
  return MaterialLocalizations.of(context).formatMediumDate(day);
}
