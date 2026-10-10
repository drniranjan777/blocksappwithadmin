import 'package:blocks_app/data/models/security_models.dart';
import 'package:flutter/foundation.dart';

/// How the mock *server* describes the device the demo runs on.
///
/// In production the server derives this from the request itself (user agent,
/// TLS / app attestation, IP geolocation) and the app never supplies it: a
/// client-reported device name or location could simply be lied about. The
/// location is always approximate (city level), never exact.
DeviceDescriptor describeThisDevice({bool? isWeb, TargetPlatform? platform}) {
  const location = 'Hyderabad, India';
  if (isWeb ?? kIsWeb) {
    return const DeviceDescriptor(
      name: 'This browser',
      platform: 'Web',
      appOrBrowser: 'Browser',
      approximateLocation: location,
    );
  }
  return switch (platform ?? defaultTargetPlatform) {
    TargetPlatform.android => const DeviceDescriptor(
      name: 'This Android phone',
      platform: 'Android',
      appOrBrowser: 'BLOCKS app',
      approximateLocation: location,
    ),
    TargetPlatform.iOS => const DeviceDescriptor(
      name: 'This iPhone',
      platform: 'iOS',
      appOrBrowser: 'BLOCKS app',
      approximateLocation: location,
    ),
    TargetPlatform.windows => const DeviceDescriptor(
      name: 'This Windows PC',
      platform: 'Windows',
      appOrBrowser: 'BLOCKS app',
      approximateLocation: location,
    ),
    TargetPlatform.macOS => const DeviceDescriptor(
      name: 'This Mac',
      platform: 'macOS',
      appOrBrowser: 'BLOCKS app',
      approximateLocation: location,
    ),
    TargetPlatform.linux || TargetPlatform.fuchsia => const DeviceDescriptor(
      name: 'This computer',
      platform: 'Linux',
      appOrBrowser: 'BLOCKS app',
      approximateLocation: location,
    ),
  };
}
