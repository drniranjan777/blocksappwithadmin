import 'package:blocks_app/core/constants/storage_keys.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Every on/off preference in one enum so adding one is a one-line change.
enum AppFlag {
  notifLikes(true),
  notifComments(true),
  notifFollowers(true),
  notifReach(true),
  notifEarnings(true),
  notifBusiness(true),
  autoplay(true),
  dataSaver(false),
  showReachBadge(true),
  creatorShowEarnings(true),
  weeklySummary(true),
  businessAutoReply(false),
  businessShowContact(true),
  privateAccount(false),
  loginAlerts(true),

  /// Reels sound. Off by default and **session-only**: a fresh app launch
  /// always starts muted, so audio can never start unexpectedly.
  reelsSoundEnabled(false, persistent: false);

  const AppFlag(this.defaultValue, {this.persistent = true});

  final bool defaultValue;

  /// False = kept in [AppSettings] for the running session only; it is never
  /// written to disk and is not restored on the next launch.
  final bool persistent;
}

enum SensitiveContentLevel { less, standard, more }

/// Who may comment / message.
enum InteractionScope { everyone, followers, nobody }

class AppSettings extends Equatable {
  const AppSettings({
    this.themeMode = ThemeMode.system,
    this.languageCode,
    this.flags = const {},
    this.sensitive = SensitiveContentLevel.standard,
    this.whoCanComment = InteractionScope.everyone,
    this.whoCanMessage = InteractionScope.everyone,
  });

  final ThemeMode themeMode;

  /// null = follow the device language.
  final String? languageCode;
  final Map<AppFlag, bool> flags;
  final SensitiveContentLevel sensitive;
  final InteractionScope whoCanComment;
  final InteractionScope whoCanMessage;

  bool isOn(AppFlag flag) => flags[flag] ?? flag.defaultValue;

  Locale? get locale => languageCode == null ? null : Locale(languageCode!);

  AppSettings copyWith({
    ThemeMode? themeMode,
    String? languageCode,
    bool clearLanguage = false,
    Map<AppFlag, bool>? flags,
    SensitiveContentLevel? sensitive,
    InteractionScope? whoCanComment,
    InteractionScope? whoCanMessage,
  }) {
    return AppSettings(
      themeMode: themeMode ?? this.themeMode,
      languageCode: clearLanguage ? null : (languageCode ?? this.languageCode),
      flags: flags ?? this.flags,
      sensitive: sensitive ?? this.sensitive,
      whoCanComment: whoCanComment ?? this.whoCanComment,
      whoCanMessage: whoCanMessage ?? this.whoCanMessage,
    );
  }

  @override
  List<Object?> get props => [
    themeMode,
    languageCode,
    flags,
    sensitive,
    whoCanComment,
    whoCanMessage,
  ];
}

/// App preferences, persisted on device (non-sensitive values only).
class AppSettingsController extends Notifier<AppSettings> {
  LocalStore get _store => ref.read(localStoreProvider);

  @override
  AppSettings build() {
    final store = ref.read(localStoreProvider);

    T pick<T extends Enum>(String? raw, List<T> values, T fallback) {
      for (final v in values) {
        if (v.name == raw) return v;
      }
      return fallback;
    }

    return AppSettings(
      themeMode: pick(
        store.getString(StorageKeys.themeMode),
        ThemeMode.values,
        ThemeMode.system,
      ),
      languageCode: store.getString(StorageKeys.languageCode),
      flags: {
        for (final f in AppFlag.values)
          if (f.persistent && store.getBool(StorageKeys.flag(f.name)) != null)
            f: store.getBool(StorageKeys.flag(f.name))!,
      },
      sensitive: pick(
        store.getString(StorageKeys.sensitiveContent),
        SensitiveContentLevel.values,
        SensitiveContentLevel.standard,
      ),
      whoCanComment: pick(
        store.getString(StorageKeys.whoCanComment),
        InteractionScope.values,
        InteractionScope.everyone,
      ),
      whoCanMessage: pick(
        store.getString(StorageKeys.whoCanMessage),
        InteractionScope.values,
        InteractionScope.everyone,
      ),
    );
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = state.copyWith(themeMode: mode);
    await _store.setString(StorageKeys.themeMode, mode.name);
  }

  /// Pass null to follow the device language.
  Future<void> setLanguage(String? code) async {
    if (code == null) {
      state = state.copyWith(clearLanguage: true);
      await _store.remove(StorageKeys.languageCode);
    } else {
      state = state.copyWith(languageCode: code);
      await _store.setString(StorageKeys.languageCode, code);
    }
  }

  Future<void> setFlag(AppFlag flag, {required bool value}) async {
    state = state.copyWith(flags: {...state.flags, flag: value});
    if (flag.persistent) {
      await _store.setBool(StorageKeys.flag(flag.name), value: value);
    }
  }

  Future<void> setSensitive(SensitiveContentLevel v) async {
    state = state.copyWith(sensitive: v);
    await _store.setString(StorageKeys.sensitiveContent, v.name);
  }

  Future<void> setWhoCanComment(InteractionScope v) async {
    state = state.copyWith(whoCanComment: v);
    await _store.setString(StorageKeys.whoCanComment, v.name);
  }

  Future<void> setWhoCanMessage(InteractionScope v) async {
    state = state.copyWith(whoCanMessage: v);
    await _store.setString(StorageKeys.whoCanMessage, v.name);
  }
}

final appSettingsProvider =
    NotifierProvider<AppSettingsController, AppSettings>(
      AppSettingsController.new,
    );

/// Narrow selector so toggling one switch rebuilds only that switch.
final flagProvider = Provider.family<bool, AppFlag>(
  (ref, flag) => ref.watch(appSettingsProvider.select((s) => s.isOn(flag))),
);
