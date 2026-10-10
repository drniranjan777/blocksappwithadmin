import 'package:blocks_app/app/router/routes.dart';

/// Where a security notification leads, encoded in `AppNotification.targetId`.
///
/// `alert:<eventId>` opens the Security Alert screen for that event;
/// the others open a fixed screen.
abstract final class SecurityTargets {
  static const _alert = 'alert:';
  static const devices = 'devices';
  static const activity = 'activity';
  static const twoFactor = 'two-factor';
  static const payouts = 'payouts';

  static String alert(String eventId) => '$_alert$eventId';

  /// The app route for a security notification target, or null if unknown.
  static String? routeFor(String? target) {
    if (target == null) return null;
    if (target.startsWith(_alert)) {
      return Routes.securityAlert(target.substring(_alert.length));
    }
    return switch (target) {
      devices => Routes.devices,
      activity => Routes.loginActivity,
      twoFactor => Routes.twoFactor,
      payouts => Routes.payoutBank,
      _ => null,
    };
  }
}
