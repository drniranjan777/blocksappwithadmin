import 'package:blocks_app/core/errors/app_failure.dart';

const _unexpected = UnknownFailure('The server sent something unexpected');

/// Reads a JSON object from the server without trusting its shape.
///
/// A field that is required but missing or of the wrong type becomes an
/// [UnknownFailure] (which every screen already knows how to show) instead of a
/// type error deep inside a widget. Optional fields fall back to a stated
/// default.
class JsonObject {
  const JsonObject._(this._map);

  factory JsonObject.of(Object? value) {
    if (value is Map) return JsonObject._(value.cast<String, Object?>());
    throw _unexpected;
  }

  final Map<String, Object?> _map;

  /// The underlying map, for handing a whole object to a parser of its own.
  Map<String, Object?> get raw => _map;

  /// A required, non-empty string.
  String string(String key) {
    final v = _map[key];
    if (v is String && v.isNotEmpty) return v;
    throw _unexpected;
  }

  String stringOr(String key, String fallback) {
    final v = _map[key];
    return v is String ? v : fallback;
  }

  String? stringOrNull(String key) {
    final v = _map[key];
    return v is String && v.isNotEmpty ? v : null;
  }

  int integer(String key, {int fallback = 0}) {
    final v = _map[key];
    return v is num ? v.toInt() : fallback;
  }

  bool boolean(String key, {bool fallback = false}) {
    final v = _map[key];
    return v is bool ? v : fallback;
  }

  /// A required nested object.
  JsonObject object(String key) => JsonObject.of(_map[key]);

  JsonObject? objectOrNull(String key) {
    final v = _map[key];
    return v is Map ? JsonObject.of(v) : null;
  }

  /// A list of objects; a missing key is an empty list, an item that is not an
  /// object is the server's mistake.
  List<JsonObject> objects(String key) {
    final v = _map[key];
    if (v == null) return const [];
    if (v is! List) throw _unexpected;
    return [for (final item in v) JsonObject.of(item)];
  }

  /// A list of strings; anything else in it is skipped.
  List<String> strings(String key) {
    final v = _map[key];
    return v is List
        ? [
            for (final s in v)
              if (s is String) s,
          ]
        : const [];
  }

  /// A required ISO-8601 time, as UTC.
  DateTime date(String key) {
    final v = _map[key];
    final parsed = v is String ? DateTime.tryParse(v) : null;
    if (parsed == null) throw _unexpected;
    return parsed.toUtc();
  }

  DateTime? dateOrNull(String key) {
    final v = _map[key];
    return v is String ? DateTime.tryParse(v)?.toUtc() : null;
  }

  bool has(String key) => _map[key] != null;
}
