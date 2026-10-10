/// Keys for [LocalStore]. Non-sensitive flags only.
abstract final class StorageKeys {
  static const onboardingCompleted = 'onboarding_completed';
  static const demoSessionActive = 'demo_session_active';
  static const themeMode = 'theme_mode';
  static const languageCode = 'language_code';
  static const sensitiveContent = 'pref_sensitive_content';
  static const whoCanComment = 'pref_who_can_comment';
  static const whoCanMessage = 'pref_who_can_message';

  /// Boolean preference flags are stored as `pref_flag_<name>`.
  static String flag(String name) => 'pref_flag_$name';
}
