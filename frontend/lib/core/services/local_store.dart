import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Tiny key-value abstraction over on-device storage.
///
/// Only non-sensitive UI/session flags belong here. Tokens and credentials
/// must go to platform secure storage when real auth is introduced.
abstract class LocalStore {
  bool? getBool(String key);
  Future<void> setBool(String key, {required bool value});
  String? getString(String key);
  Future<void> setString(String key, String value);
  Future<void> remove(String key);
}

class SharedPrefsLocalStore implements LocalStore {
  const SharedPrefsLocalStore(this._prefs);

  final SharedPreferences _prefs;

  @override
  bool? getBool(String key) => _prefs.getBool(key);

  @override
  Future<void> setBool(String key, {required bool value}) =>
      _prefs.setBool(key, value);

  @override
  String? getString(String key) => _prefs.getString(key);

  @override
  Future<void> setString(String key, String value) =>
      _prefs.setString(key, value);

  @override
  Future<void> remove(String key) => _prefs.remove(key);
}

/// Used by tests and previews.
class InMemoryLocalStore implements LocalStore {
  InMemoryLocalStore([Map<String, Object>? seed]) : _data = {...?seed};

  final Map<String, Object> _data;

  @override
  bool? getBool(String key) => _data[key] as bool?;

  @override
  Future<void> setBool(String key, {required bool value}) async =>
      _data[key] = value;

  @override
  String? getString(String key) => _data[key] as String?;

  @override
  Future<void> setString(String key, String value) async => _data[key] = value;

  @override
  Future<void> remove(String key) async => _data.remove(key);
}

/// Must be overridden in `main()` (real) and in tests (in-memory).
final localStoreProvider = Provider<LocalStore>(
  (ref) => throw UnimplementedError('localStoreProvider must be overridden'),
);
