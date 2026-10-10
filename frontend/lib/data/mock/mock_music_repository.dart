import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/mock/mock_music_catalog.dart';
import 'package:blocks_app/data/mock/mock_paging.dart';
import 'package:blocks_app/data/mock/mock_world.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/repositories/music_repository.dart';

/// The mock music server.
///
/// It plays the part production gives to the backend: it applies the rights
/// check (licence, country, expiry) **before** a track can appear anywhere, so
/// the app never sees, and can never attach, a track BLOCKS may not use.
class MockMusicRepository implements MusicRepository {
  MockMusicRepository(this._w, {this.country = 'IN'});

  final MockWorld _w;

  /// Where the signed-in creator is. Production derives this server-side.
  final String country;

  List<MusicTrack> get _usable {
    final now = _w.now();
    return [
      for (final t in kMusicCatalog)
        if (t.isAvailable(country: country, now: now)) t,
    ];
  }

  @override
  Future<List<MusicTrack>> getTrending({int limit = 10}) async {
    await _w.pause();
    final tracks = [
      for (final t in _usable)
        if (t.categories.contains(MusicCategory.trending)) t,
    ]..sort((a, b) => b.reelsCount.compareTo(a.reelsCount));
    return tracks.take(limit).toList();
  }

  @override
  Future<PagedResult<MusicTrack>> browse({
    MusicCategory? category,
    String query = '',
    String? cursor,
    int limit = 20,
  }) async {
    await _w.pause();
    final q = query.trim().toLowerCase();
    final all = [
      for (final t in _usable)
        if ((category == null || t.categories.contains(category)) &&
            (q.isEmpty || _matches(t, q)))
          t,
    ];
    // Most used first: what creators are reaching for right now.
    all.sort((a, b) => b.reelsCount.compareTo(a.reelsCount));
    return pageByIndex<MusicTrack>(
      cursor: cursor,
      limit: limit,
      total: all.length,
      build: (i) => all[i],
    );
  }

  bool _matches(MusicTrack t, String q) =>
      t.title.toLowerCase().contains(q) ||
      t.artist.toLowerCase().contains(q) ||
      t.language.toLowerCase().contains(q) ||
      t.genre.toLowerCase().contains(q);

  @override
  Future<MusicTrack> getTrack(String id) async {
    await _w.pause();
    for (final t in _usable) {
      if (t.id == id) return t;
    }
    throw NotFoundFailure('Track $id is not available');
  }
}
