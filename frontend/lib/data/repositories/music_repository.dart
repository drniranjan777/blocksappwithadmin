import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';

/// The BLOCKS music library.
///
/// Every track returned has already passed the **server's** rights check
/// (licensed / platform-owned / creator-owned, in this country, not expired).
/// The app never offers a track the server did not return.
abstract interface class MusicRepository {
  /// Most-used tracks right now, with their reel counts.
  Future<List<MusicTrack>> getTrending({int limit = 10});

  /// Browse or search. [query] matches title, artist, language and genre.
  Future<PagedResult<MusicTrack>> browse({
    MusicCategory? category,
    String query = '',
    String? cursor,
    int limit = 20,
  });

  /// Throws `NotFoundFailure` when the track is gone (e.g. licence expired).
  Future<MusicTrack> getTrack(String id);
}
