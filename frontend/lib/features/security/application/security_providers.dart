import 'package:blocks_app/data/models/security_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/notifications/application/notification_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;

final securityPolicyProvider = FutureProvider<SecurityPolicy>(
  (ref) => ref.watch(securityRepositoryProvider).getPolicy(),
);

final securityContactsProvider = FutureProvider<AccountContacts>(
  (ref) => ref.watch(securityRepositoryProvider).getContacts(),
);

final twoFactorProvider = FutureProvider<TwoFactorSettings>(
  (ref) => ref.watch(securityRepositoryProvider).getTwoFactor(),
);

final sessionsProvider = FutureProvider<List<DeviceSession>>(
  (ref) => ref.watch(sessionRepositoryProvider).getSessions(),
);

final securityEventsProvider =
    FutureProvider.family<List<SecurityEvent>, SecurityEventFilter>(
      (ref, filter) =>
          ref.watch(securityRepositoryProvider).getEvents(filter: filter),
    );

final securityEventProvider = FutureProvider.family<SecurityEvent, String>(
  (ref, id) => ref.watch(securityRepositoryProvider).getEvent(id),
);

/// Which filter chip is selected on the Login Activity screen.
class SecurityFilterSelection extends Notifier<SecurityEventFilter> {
  @override
  SecurityEventFilter build() => SecurityEventFilter.all;

  void select(SecurityEventFilter filter) => state = filter;
}

final securityFilterProvider =
    NotifierProvider.autoDispose<SecurityFilterSelection, SecurityEventFilter>(
      SecurityFilterSelection.new,
    );

final alertPreferencesProvider = FutureProvider<SecurityAlertPreferences>(
  (ref) => ref.watch(securityRepositoryProvider).getAlertPreferences(),
);

final sentAlertsProvider = FutureProvider<List<SentSecurityEmail>>(
  (ref) => ref.watch(securityRepositoryProvider).getSentAlerts(),
);

final _securityState = <ProviderOrFamily>[
  securityContactsProvider,
  twoFactorProvider,
  sessionsProvider,
  securityEventsProvider,
  securityEventProvider,
  alertPreferencesProvider,
  sentAlertsProvider,
  notificationsProvider,
  unreadNotificationsProvider,
];

/// Refreshes every security screen's data and the notification bell. Call after
/// anything that changes the account's security state (the server may have
/// added events, alerts or e-mails as a side effect).
void refreshSecurityFrom(Ref ref) => _securityState.forEach(ref.invalidate);

/// Same, from a widget.
void refreshSecurity(WidgetRef ref) => _securityState.forEach(ref.invalidate);
