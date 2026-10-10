import 'dart:convert';

import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/local_store.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/repositories/reel_draft_repository.dart';

/// Reel drafts kept on this device (JSON in [LocalStore]).
///
/// A draft is only the edit: clip order, trims, looks, text, music, settings.
/// Production keeps this same local copy for offline editing and also syncs it
/// to the server, so a draft follows the creator to another device.
class MockReelDraftRepository implements ReelDraftRepository {
  MockReelDraftRepository(this._store, this._w);

  final LocalStore _store;
  final MockWorld _w;

  static const storageKey = 'reel_drafts_v1';

  List<ReelDraft> _read() {
    final raw = _store.getString(storageKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = (jsonDecode(raw) as List<Object?>);
      return [
        for (final j in list)
          ReelDraft.fromJson((j! as Map).cast<String, Object?>()),
      ];
    } on Object {
      // A draft that can't be read is dropped rather than crashing the app.
      return [];
    }
  }

  Future<void> _write(List<ReelDraft> drafts) => _store.setString(
    storageKey,
    jsonEncode([for (final d in drafts) d.toJson()]),
  );

  @override
  Future<List<ReelDraft>> list() async {
    final all = _read()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return all;
  }

  @override
  Future<ReelDraft?> get(String id) async {
    for (final d in _read()) {
      if (d.id == id) return d;
    }
    return null;
  }

  @override
  Future<void> save(ReelDraft draft) async {
    final all = _read();
    final i = all.indexWhere((d) => d.id == draft.id);
    final stamped = draft.copyWith(updatedAt: _w.now());
    if (i < 0) {
      all.add(stamped);
    } else {
      all[i] = stamped;
    }
    await _write(all);
  }

  @override
  Future<void> delete(String id) async {
    final all = _read()..removeWhere((d) => d.id == id);
    await _write(all);
  }

  @override
  Future<ReelDraft> duplicate(String id) async {
    final all = _read();
    final source = all.where((d) => d.id == id).firstOrNull;
    if (source == null) throw const NotFoundFailure('Draft not found');
    final now = _w.now();
    final copy = ReelDraft(
      id: _w.nextId('draft'),
      clips: source.clips,
      overlays: source.overlays,
      settings: source.settings,
      music: source.music,
      updatedAt: now,
      createdAt: now,
    );
    all.add(copy);
    await _write(all);
    return copy;
  }
}
