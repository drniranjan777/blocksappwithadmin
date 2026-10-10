import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Tells the server which install is signing in, so the person can recognise it
/// in their device list and the server can tell a known device from a new one.
///
/// The id is random, made once per install and kept in secure storage. It is not
/// derived from the hardware (no IMEI, advertising id or serial number), so it
/// cannot follow a person to another app or survive a reinstall.
class DeviceIdentity {
  const DeviceIdentity({
    required this.id,
    required this.name,
    required this.platform,
  });

  /// Names the device the app is running on, for the given random [id].
  factory DeviceIdentity.describe(
    String id, {
    bool? isWeb,
    TargetPlatform? platform,
  }) {
    if (isWeb ?? kIsWeb) {
      return DeviceIdentity(id: id, name: 'Web browser', platform: 'WEB');
    }
    return switch (platform ?? defaultTargetPlatform) {
      TargetPlatform.android => DeviceIdentity(
        id: id,
        name: 'Android phone',
        platform: 'ANDROID',
      ),
      TargetPlatform.iOS => DeviceIdentity(
        id: id,
        name: 'iPhone',
        platform: 'IOS',
      ),
      _ => DeviceIdentity(id: id, name: 'Computer', platform: 'UNKNOWN'),
    };
  }

  final String id;
  final String name;

  /// `ANDROID`, `IOS`, `WEB` or `UNKNOWN`, as the API spells them.
  final String platform;

  /// The `device` object the sign-in and registration calls accept.
  Map<String, Object?> toJson() => {
    'deviceId': id,
    'deviceName': name,
    'platform': platform,
  };
}

/// Where this install's random id is kept.
abstract interface class DeviceIdStore {
  String get id;
}

/// For tests and mock builds.
class MemoryDeviceIdStore implements DeviceIdStore {
  MemoryDeviceIdStore([String? id]) : id = id ?? randomDeviceId();

  @override
  final String id;
}

/// A fresh random id: 24 lower-case hex characters (96 bits).
String randomDeviceId([Random? random]) {
  final r = random ?? Random.secure();
  return List.generate(24, (_) => r.nextInt(16).toRadixString(16)).join();
}

/// Keychain / Keystore-backed. Read once at start-up so [id] is synchronous.
class SecureDeviceIdStore implements DeviceIdStore {
  SecureDeviceIdStore._(this.id);

  static const _key = 'blocks.device.v1';
  static final _valid = RegExp(r'^[0-9a-f]{24}$');

  static Future<SecureDeviceIdStore> open({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
    Random? random,
  }) async {
    try {
      final stored = await storage.read(key: _key);
      if (stored != null && _valid.hasMatch(stored)) {
        return SecureDeviceIdStore._(stored);
      }
    } on Object {
      // Unreadable: make a new one below.
    }
    final id = randomDeviceId(random);
    try {
      await storage.write(key: _key, value: id);
    } on Object {
      // Storage unavailable: the id lasts until the app closes, which only
      // means this device may look new next time.
    }
    return SecureDeviceIdStore._(id);
  }

  @override
  final String id;
}
