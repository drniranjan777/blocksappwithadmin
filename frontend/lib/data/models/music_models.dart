import 'package:equatable/equatable.dart';

/// Who may use a track, and under what licence. **A file being on a server is
/// not a right to distribute it**: production music must come from licensed or
/// platform-owned catalogues, or be owned by the creator.
enum MusicRightsType {
  /// BLOCKS holds the licence.
  platformOwned,

  /// Licensed from a rights holder / label catalogue.
  licensed,

  /// The creator made it and grants BLOCKS the right to use it.
  creatorOwned,

  /// Public domain / royalty-free.
  royaltyFree,

  /// No usable licence: must never be offered.
  restricted,
}

enum MusicCategory {
  trending,
  popular,
  newReleases,
  hindi,
  telugu,
  tamil,
  bengali,
  marathi,
  punjabi,
  kannada,
  malayalam,
  instrumental,
  devotional,
  travel,
  fitness,
  romantic,
  comedy,
}

/// One track in the BLOCKS music library.
class MusicTrack extends Equatable {
  const MusicTrack({
    required this.id,
    required this.title,
    required this.artist,
    required this.language,
    required this.duration,
    required this.rightsType,
    required this.categories,
    this.audioUrl = '',
    this.coverUrl,
    this.genre = '',
    this.reelsCount = 0,
    this.allowedCountries = const ['IN'],
    this.licenseExpiry,
    this.previewSeed = 0,
  });

  factory MusicTrack.fromJson(Map<String, Object?> j) => MusicTrack(
    id: j['id']! as String,
    title: j['title']! as String,
    artist: j['artist']! as String,
    language: j['language']! as String,
    duration: Duration(milliseconds: j['durationMs']! as int),
    rightsType: MusicRightsType.values.byName(j['rights']! as String),
    categories: [
      for (final c in (j['categories']! as List<Object?>).cast<String>())
        MusicCategory.values.byName(c),
    ],
    audioUrl: (j['audioUrl'] as String?) ?? '',
    coverUrl: j['coverUrl'] as String?,
    genre: (j['genre'] as String?) ?? '',
    reelsCount: (j['reelsCount'] as int?) ?? 0,
    allowedCountries: [
      for (final c in ((j['countries'] as List<Object?>?) ?? const ['IN']))
        c! as String,
    ],
    licenseExpiry: j['licenseExpiry'] == null
        ? null
        : DateTime.parse(j['licenseExpiry']! as String),
    previewSeed: (j['previewSeed'] as int?) ?? 0,
  );

  final String id;
  final String title;
  final String artist;
  final String language;
  final Duration duration;
  final MusicRightsType rightsType;
  final List<MusicCategory> categories;

  /// Where the licensed audio is served from (empty in the demo, which plays a
  /// generated preview from [previewSeed]).
  final String audioUrl;
  final String? coverUrl;
  final String genre;

  /// How many reels use this track (shown as social proof).
  final int reelsCount;

  /// ISO country codes in which BLOCKS may play this track.
  final List<String> allowedCountries;
  final DateTime? licenseExpiry;

  /// Seed for the demo's generated preview audio.
  final int previewSeed;

  /// Whether BLOCKS may offer this track to a user in [country] at [now].
  /// **The server decides this**; the app only reflects the answer and must
  /// never let a track that fails it be attached to a reel.
  bool isAvailable({required String country, required DateTime now}) {
    if (rightsType == MusicRightsType.restricted) return false;
    if (!allowedCountries.contains(country)) return false;
    final expiry = licenseExpiry;
    if (expiry != null && !now.isBefore(expiry)) return false;
    return true;
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'artist': artist,
    'language': language,
    'durationMs': duration.inMilliseconds,
    'rights': rightsType.name,
    'categories': [for (final c in categories) c.name],
    'audioUrl': audioUrl,
    'coverUrl': coverUrl,
    'genre': genre,
    'reelsCount': reelsCount,
    'countries': allowedCountries,
    'licenseExpiry': licenseExpiry?.toIso8601String(),
    'previewSeed': previewSeed,
  };

  @override
  List<Object?> get props => [
    id,
    title,
    artist,
    language,
    duration,
    rightsType,
    categories,
    audioUrl,
    coverUrl,
    genre,
    reelsCount,
    allowedCountries,
    licenseExpiry,
    previewSeed,
  ];
}

/// The soundtrack chosen for a reel: a track and the slice of it that plays.
/// A null selection means "original audio" (the clips' own sound).
class MusicSelection extends Equatable {
  const MusicSelection({
    required this.track,
    required this.start,
    required this.end,
  });

  factory MusicSelection.fromJson(Map<String, Object?> j) => MusicSelection(
    track: MusicTrack.fromJson((j['track']! as Map).cast<String, Object?>()),
    start: Duration(milliseconds: j['startMs']! as int),
    end: Duration(milliseconds: j['endMs']! as int),
  );

  final MusicTrack track;
  final Duration start;
  final Duration end;

  Duration get length => end - start;

  MusicSelection copyWith({Duration? start, Duration? end}) => MusicSelection(
    track: track,
    start: start ?? this.start,
    end: end ?? this.end,
  );

  Map<String, Object?> toJson() => {
    'track': track.toJson(),
    'startMs': start.inMilliseconds,
    'endMs': end.inMilliseconds,
  };

  @override
  List<Object?> get props => [track, start, end];
}

// ------------------------------------------------- the creator's own music --

enum MusicUsageStatus {
  /// Can be used in new reels.
  available,

  /// Can be used now, but the licence ends within the warning window.
  expiringSoon,

  /// Cannot be used in new reels (licence ended, not allowed here, or
  /// restricted).
  unavailable,
}

/// A track the creator has used, and where it stands with the rights holder.
/// The status comes from the **server's** rights check, not from the app.
class MusicUsage extends Equatable {
  const MusicUsage({
    required this.track,
    required this.reelCount,
    required this.status,
    this.reason,
  });

  final MusicTrack track;

  /// How many of the creator's reels use it.
  final int reelCount;
  final MusicUsageStatus status;

  /// Why it is unavailable: `expired`, `region` or `restricted`.
  final String? reason;

  @override
  List<Object?> get props => [track, reelCount, status, reason];
}

/// Audio the creator recorded in a reel. Others may reuse it only if the
/// creator allows it.
class OriginalAudio extends Equatable {
  const OriginalAudio({
    required this.id,
    required this.title,
    required this.duration,
    required this.reelsUsing,
    required this.reusable,
  });

  final String id;
  final String title;
  final Duration duration;

  /// Reels (the creator's own and others') that use this audio.
  final int reelsUsing;
  final bool reusable;

  OriginalAudio copyWith({bool? reusable}) => OriginalAudio(
    id: id,
    title: title,
    duration: duration,
    reelsUsing: reelsUsing,
    reusable: reusable ?? this.reusable,
  );

  @override
  List<Object?> get props => [id, title, duration, reelsUsing, reusable];
}

/// Everything the "Copyright and music" screen shows.
class CreatorMusic extends Equatable {
  const CreatorMusic({required this.usage, required this.originals});

  final List<MusicUsage> usage;
  final List<OriginalAudio> originals;

  @override
  List<Object?> get props => [usage, originals];
}
