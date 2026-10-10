import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:equatable/equatable.dart';

// ----------------------------------------------------------------- media --

enum MediaType { video, photo }

/// Where the file lives. [demo] media is generated on-device; [device] media is
/// a real file from the camera or gallery.
enum MediaOrigin { demo, device }

enum MediaProcessingStatus { pending, optimizing, ready, failed }

/// One video or photo that can be placed on the timeline.
///
/// Sizes are real byte counts. [optimizedSizeBytes] stays 0 until the media
/// optimisation pipeline has run. A client-made file is never the final,
/// trusted version: the server transcodes and re-checks everything.
class MediaAsset extends Equatable {
  const MediaAsset({
    required this.id,
    required this.type,
    required this.origin,
    required this.localPath,
    required this.originalSizeBytes,
    required this.durationMs,
    required this.width,
    required this.height,
    this.thumbnailPath,
    this.optimizedSizeBytes = 0,
    this.status = MediaProcessingStatus.pending,
    this.name = '',
  });

  factory MediaAsset.fromJson(Map<String, Object?> j) => MediaAsset(
    id: j['id']! as String,
    type: MediaType.values.byName(j['type']! as String),
    origin: MediaOrigin.values.byName(j['origin']! as String),
    localPath: j['path']! as String,
    thumbnailPath: j['thumb'] as String?,
    originalSizeBytes: j['size']! as int,
    optimizedSizeBytes: (j['optimized'] as int?) ?? 0,
    durationMs: j['durationMs']! as int,
    width: j['w']! as int,
    height: j['h']! as int,
    status: MediaProcessingStatus.values.byName(
      (j['status'] as String?) ?? 'pending',
    ),
    name: (j['name'] as String?) ?? '',
  );

  final String id;
  final MediaType type;
  final MediaOrigin origin;

  /// `demo://clip/<n>` / `demo://photo/<n>` for demo media; a file path (or
  /// blob URL on the web) for device media.
  final String localPath;
  final String? thumbnailPath;
  final int originalSizeBytes;
  final int optimizedSizeBytes;

  /// Intrinsic length of a video. 0 for a photo.
  final int durationMs;
  final int width;
  final int height;
  final MediaProcessingStatus status;
  final String name;

  bool get isVideo => type == MediaType.video;
  bool get isPhoto => type == MediaType.photo;
  bool get isOptimized =>
      status == MediaProcessingStatus.ready && optimizedSizeBytes > 0;

  Duration get duration => Duration(milliseconds: durationMs);

  MediaAsset copyWith({
    String? thumbnailPath,
    int? optimizedSizeBytes,
    MediaProcessingStatus? status,
  }) => MediaAsset(
    id: id,
    type: type,
    origin: origin,
    localPath: localPath,
    thumbnailPath: thumbnailPath ?? this.thumbnailPath,
    originalSizeBytes: originalSizeBytes,
    optimizedSizeBytes: optimizedSizeBytes ?? this.optimizedSizeBytes,
    durationMs: durationMs,
    width: width,
    height: height,
    status: status ?? this.status,
    name: name,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'type': type.name,
    'origin': origin.name,
    'path': localPath,
    'thumb': thumbnailPath,
    'size': originalSizeBytes,
    'optimized': optimizedSizeBytes,
    'durationMs': durationMs,
    'w': width,
    'h': height,
    'status': status.name,
    'name': name,
  };

  @override
  List<Object?> get props => [
    id,
    type,
    origin,
    localPath,
    thumbnailPath,
    originalSizeBytes,
    optimizedSizeBytes,
    durationMs,
    width,
    height,
    status,
    name,
  ];
}

// ----------------------------------------------------------- adjustments --

/// Colour / look adjustments for a clip. All values are normalised:
/// brightness, contrast, saturation, temperature, highlights and shadows are
/// in -1..1; sharpness, fade and vignette are in 0..1. 0 means "unchanged".
class ReelAdjustments extends Equatable {
  const ReelAdjustments({
    this.brightness = 0,
    this.contrast = 0,
    this.saturation = 0,
    this.temperature = 0,
    this.highlights = 0,
    this.shadows = 0,
    this.sharpness = 0,
    this.fade = 0,
    this.vignette = 0,
  });

  factory ReelAdjustments.fromJson(Map<String, Object?> j) => ReelAdjustments(
    brightness: (j['brightness'] as num?)?.toDouble() ?? 0,
    contrast: (j['contrast'] as num?)?.toDouble() ?? 0,
    saturation: (j['saturation'] as num?)?.toDouble() ?? 0,
    temperature: (j['temperature'] as num?)?.toDouble() ?? 0,
    highlights: (j['highlights'] as num?)?.toDouble() ?? 0,
    shadows: (j['shadows'] as num?)?.toDouble() ?? 0,
    sharpness: (j['sharpness'] as num?)?.toDouble() ?? 0,
    fade: (j['fade'] as num?)?.toDouble() ?? 0,
    vignette: (j['vignette'] as num?)?.toDouble() ?? 0,
  );

  static const neutral = ReelAdjustments();

  final double brightness;
  final double contrast;
  final double saturation;
  final double temperature;
  final double highlights;
  final double shadows;
  final double sharpness;
  final double fade;
  final double vignette;

  bool get isNeutral => this == neutral;

  ReelAdjustments copyWith({
    double? brightness,
    double? contrast,
    double? saturation,
    double? temperature,
    double? highlights,
    double? shadows,
    double? sharpness,
    double? fade,
    double? vignette,
  }) => ReelAdjustments(
    brightness: brightness ?? this.brightness,
    contrast: contrast ?? this.contrast,
    saturation: saturation ?? this.saturation,
    temperature: temperature ?? this.temperature,
    highlights: highlights ?? this.highlights,
    shadows: shadows ?? this.shadows,
    sharpness: sharpness ?? this.sharpness,
    fade: fade ?? this.fade,
    vignette: vignette ?? this.vignette,
  );

  Map<String, Object?> toJson() => {
    'brightness': brightness,
    'contrast': contrast,
    'saturation': saturation,
    'temperature': temperature,
    'highlights': highlights,
    'shadows': shadows,
    'sharpness': sharpness,
    'fade': fade,
    'vignette': vignette,
  };

  @override
  List<Object?> get props => [
    brightness,
    contrast,
    saturation,
    temperature,
    highlights,
    shadows,
    sharpness,
    fade,
    vignette,
  ];
}

// ------------------------------------------------------------------ clip --

/// A piece of media on the timeline: which part of it plays ([start]..[end])
/// and how it looks. For a photo, [start] is zero and [end] is how long it is
/// shown.
class ReelClip extends Equatable {
  const ReelClip({
    required this.id,
    required this.media,
    required this.start,
    required this.end,
    this.volume = 1,
    this.filterId,
    this.filterIntensity = 1,
    this.transitionId,
    this.adjustments = ReelAdjustments.neutral,
  });

  factory ReelClip.fromJson(Map<String, Object?> j) => ReelClip(
    id: j['id']! as String,
    media: MediaAsset.fromJson((j['media']! as Map).cast<String, Object?>()),
    start: Duration(milliseconds: j['startMs']! as int),
    end: Duration(milliseconds: j['endMs']! as int),
    volume: (j['volume'] as num?)?.toDouble() ?? 1,
    filterId: j['filter'] as String?,
    filterIntensity: (j['filterIntensity'] as num?)?.toDouble() ?? 1,
    transitionId: j['transition'] as String?,
    adjustments: j['adjust'] == null
        ? ReelAdjustments.neutral
        : ReelAdjustments.fromJson(
            (j['adjust']! as Map).cast<String, Object?>(),
          ),
  );

  final String id;
  final MediaAsset media;
  final Duration start;
  final Duration end;
  final double volume;
  final String? filterId;
  final double filterIntensity;

  /// Transition played between this clip and the next one.
  final String? transitionId;
  final ReelAdjustments adjustments;

  Duration get duration => end - start;
  bool get isPhoto => media.isPhoto;

  ReelClip copyWith({
    String? id,
    MediaAsset? media,
    Duration? start,
    Duration? end,
    double? volume,
    String? filterId,
    bool clearFilter = false,
    double? filterIntensity,
    String? transitionId,
    bool clearTransition = false,
    ReelAdjustments? adjustments,
  }) => ReelClip(
    id: id ?? this.id,
    media: media ?? this.media,
    start: start ?? this.start,
    end: end ?? this.end,
    volume: volume ?? this.volume,
    filterId: clearFilter ? null : (filterId ?? this.filterId),
    filterIntensity: filterIntensity ?? this.filterIntensity,
    transitionId: clearTransition ? null : (transitionId ?? this.transitionId),
    adjustments: adjustments ?? this.adjustments,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'media': media.toJson(),
    'startMs': start.inMilliseconds,
    'endMs': end.inMilliseconds,
    'volume': volume,
    'filter': filterId,
    'filterIntensity': filterIntensity,
    'transition': transitionId,
    'adjust': adjustments.toJson(),
  };

  @override
  List<Object?> get props => [
    id,
    media,
    start,
    end,
    volume,
    filterId,
    filterIntensity,
    transitionId,
    adjustments,
  ];
}

// --------------------------------------------------------------- overlay --

enum OverlayType { text, sticker }

enum OverlayAlign { start, center, end }

enum TextAnimation { none, fade, pop, slideUp, typewriter }

/// Look of a text overlay.
class OverlayTextStyle extends Equatable {
  const OverlayTextStyle({
    this.fontId = 'clean',
    this.colorValue = 0xFFFFFFFF,
    this.backgroundValue,
    this.backgroundOpacity = 0.6,
    this.align = OverlayAlign.center,
    this.animation = TextAnimation.none,
    this.bold = true,
  });

  factory OverlayTextStyle.fromJson(Map<String, Object?> j) => OverlayTextStyle(
    fontId: (j['font'] as String?) ?? 'clean',
    colorValue: (j['color'] as int?) ?? 0xFFFFFFFF,
    backgroundValue: j['bg'] as int?,
    backgroundOpacity: (j['bgOpacity'] as num?)?.toDouble() ?? 0.6,
    align: OverlayAlign.values.byName((j['align'] as String?) ?? 'center'),
    animation: TextAnimation.values.byName((j['anim'] as String?) ?? 'none'),
    bold: (j['bold'] as bool?) ?? true,
  );

  final String fontId;
  final int colorValue;

  /// Null = no background box.
  final int? backgroundValue;
  final double backgroundOpacity;
  final OverlayAlign align;
  final TextAnimation animation;
  final bool bold;

  OverlayTextStyle copyWith({
    String? fontId,
    int? colorValue,
    int? backgroundValue,
    bool clearBackground = false,
    double? backgroundOpacity,
    OverlayAlign? align,
    TextAnimation? animation,
    bool? bold,
  }) => OverlayTextStyle(
    fontId: fontId ?? this.fontId,
    colorValue: colorValue ?? this.colorValue,
    backgroundValue: clearBackground
        ? null
        : (backgroundValue ?? this.backgroundValue),
    backgroundOpacity: backgroundOpacity ?? this.backgroundOpacity,
    align: align ?? this.align,
    animation: animation ?? this.animation,
    bold: bold ?? this.bold,
  );

  Map<String, Object?> toJson() => {
    'font': fontId,
    'color': colorValue,
    'bg': backgroundValue,
    'bgOpacity': backgroundOpacity,
    'align': align.name,
    'anim': animation.name,
    'bold': bold,
  };

  @override
  List<Object?> get props => [
    fontId,
    colorValue,
    backgroundValue,
    backgroundOpacity,
    align,
    animation,
    bold,
  ];
}

/// A caption or sticker on the video, visible from [start] to [end] on the
/// whole-reel timeline. Position is the overlay's centre, normalised 0..1 of
/// the frame, so it stays put on any screen size.
class ReelOverlay extends Equatable {
  const ReelOverlay({
    required this.id,
    required this.type,
    required this.content,
    required this.start,
    required this.end,
    this.x = 0.5,
    this.y = 0.5,
    this.scale = 1,
    this.rotation = 0,
    this.textStyle = const OverlayTextStyle(),
  });

  factory ReelOverlay.fromJson(Map<String, Object?> j) => ReelOverlay(
    id: j['id']! as String,
    type: OverlayType.values.byName(j['type']! as String),
    content: j['content']! as String,
    start: Duration(milliseconds: j['startMs']! as int),
    end: Duration(milliseconds: j['endMs']! as int),
    x: (j['x'] as num?)?.toDouble() ?? 0.5,
    y: (j['y'] as num?)?.toDouble() ?? 0.5,
    scale: (j['scale'] as num?)?.toDouble() ?? 1,
    rotation: (j['rotation'] as num?)?.toDouble() ?? 0,
    textStyle: j['style'] == null
        ? const OverlayTextStyle()
        : OverlayTextStyle.fromJson(
            (j['style']! as Map).cast<String, Object?>(),
          ),
  );

  final String id;
  final OverlayType type;

  /// The text, or the sticker (an emoji / sticker id).
  final String content;
  final Duration start;
  final Duration end;
  final double x;
  final double y;
  final double scale;

  /// Radians.
  final double rotation;
  final OverlayTextStyle textStyle;

  bool get isText => type == OverlayType.text;
  Duration get duration => end - start;

  bool isVisibleAt(Duration t) => t >= start && t < end;

  ReelOverlay copyWith({
    String? content,
    Duration? start,
    Duration? end,
    double? x,
    double? y,
    double? scale,
    double? rotation,
    OverlayTextStyle? textStyle,
  }) => ReelOverlay(
    id: id,
    type: type,
    content: content ?? this.content,
    start: start ?? this.start,
    end: end ?? this.end,
    x: x ?? this.x,
    y: y ?? this.y,
    scale: scale ?? this.scale,
    rotation: rotation ?? this.rotation,
    textStyle: textStyle ?? this.textStyle,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'type': type.name,
    'content': content,
    'startMs': start.inMilliseconds,
    'endMs': end.inMilliseconds,
    'x': x,
    'y': y,
    'scale': scale,
    'rotation': rotation,
    'style': textStyle.toJson(),
  };

  @override
  List<Object?> get props => [
    id,
    type,
    content,
    start,
    end,
    x,
    y,
    scale,
    rotation,
    textStyle,
  ];
}

// -------------------------------------------------------------- settings --

enum CoverMode { firstFrame, frame, image }

/// Publishing choices that are not part of the edit itself.
class ReelSettings extends Equatable {
  const ReelSettings({
    this.caption = '',
    this.district = '',
    this.state = '',
    this.audience = PostAudience.everyone,
    this.allowComments = true,
    this.allowReuse = true,
    this.allowSharing = true,
    this.taggedUserIds = const [],
    this.coverMode = CoverMode.firstFrame,
    this.coverFrameMs = 0,
    this.coverImageSeed,
    this.coverText = '',
    this.durationLimitSeconds = 30,
  });

  factory ReelSettings.fromJson(Map<String, Object?> j) => ReelSettings(
    caption: (j['caption'] as String?) ?? '',
    district: (j['district'] as String?) ?? '',
    state: (j['state'] as String?) ?? '',
    audience: PostAudience.values.byName(
      (j['audience'] as String?) ?? 'everyone',
    ),
    allowComments: (j['comments'] as bool?) ?? true,
    allowReuse: (j['reuse'] as bool?) ?? true,
    allowSharing: (j['sharing'] as bool?) ?? true,
    taggedUserIds: [
      for (final u in ((j['tagged'] as List<Object?>?) ?? const []))
        u! as String,
    ],
    coverMode: CoverMode.values.byName(
      (j['coverMode'] as String?) ?? 'firstFrame',
    ),
    coverFrameMs: (j['coverFrameMs'] as int?) ?? 0,
    coverImageSeed: j['coverSeed'] as int?,
    coverText: (j['coverText'] as String?) ?? '',
    durationLimitSeconds: (j['limit'] as int?) ?? 30,
  );

  final String caption;
  final String district;
  final String state;
  final PostAudience audience;
  final bool allowComments;
  final bool allowReuse;
  final bool allowSharing;
  final List<String> taggedUserIds;
  final CoverMode coverMode;
  final int coverFrameMs;
  final int? coverImageSeed;
  final String coverText;

  /// The length the creator chose to stay under (one of the configured options).
  final int durationLimitSeconds;

  ReelSettings copyWith({
    String? caption,
    String? district,
    String? state,
    PostAudience? audience,
    bool? allowComments,
    bool? allowReuse,
    bool? allowSharing,
    List<String>? taggedUserIds,
    CoverMode? coverMode,
    int? coverFrameMs,
    int? coverImageSeed,
    String? coverText,
    int? durationLimitSeconds,
  }) => ReelSettings(
    caption: caption ?? this.caption,
    district: district ?? this.district,
    state: state ?? this.state,
    audience: audience ?? this.audience,
    allowComments: allowComments ?? this.allowComments,
    allowReuse: allowReuse ?? this.allowReuse,
    allowSharing: allowSharing ?? this.allowSharing,
    taggedUserIds: taggedUserIds ?? this.taggedUserIds,
    coverMode: coverMode ?? this.coverMode,
    coverFrameMs: coverFrameMs ?? this.coverFrameMs,
    coverImageSeed: coverImageSeed ?? this.coverImageSeed,
    coverText: coverText ?? this.coverText,
    durationLimitSeconds: durationLimitSeconds ?? this.durationLimitSeconds,
  );

  Map<String, Object?> toJson() => {
    'caption': caption,
    'district': district,
    'state': state,
    'audience': audience.name,
    'comments': allowComments,
    'reuse': allowReuse,
    'sharing': allowSharing,
    'tagged': taggedUserIds,
    'coverMode': coverMode.name,
    'coverFrameMs': coverFrameMs,
    'coverSeed': coverImageSeed,
    'coverText': coverText,
    'limit': durationLimitSeconds,
  };

  @override
  List<Object?> get props => [
    caption,
    district,
    state,
    audience,
    allowComments,
    allowReuse,
    allowSharing,
    taggedUserIds,
    coverMode,
    coverFrameMs,
    coverImageSeed,
    coverText,
    durationLimitSeconds,
  ];
}

// ----------------------------------------------------------------- draft --

/// A reel being made: clips in order, soundtrack, overlays and settings.
/// Saved locally in the demo; synced with the server in production.
class ReelDraft extends Equatable {
  const ReelDraft({
    required this.id,
    required this.clips,
    required this.overlays,
    required this.settings,
    required this.updatedAt,
    required this.createdAt,
    this.music,
  });

  factory ReelDraft.empty({required String id, required DateTime now}) =>
      ReelDraft(
        id: id,
        clips: const [],
        overlays: const [],
        settings: const ReelSettings(),
        updatedAt: now,
        createdAt: now,
      );

  factory ReelDraft.fromJson(Map<String, Object?> j) => ReelDraft(
    id: j['id']! as String,
    clips: [
      for (final c in (j['clips']! as List<Object?>))
        ReelClip.fromJson((c! as Map).cast<String, Object?>()),
    ],
    overlays: [
      for (final o in (j['overlays']! as List<Object?>))
        ReelOverlay.fromJson((o! as Map).cast<String, Object?>()),
    ],
    settings: ReelSettings.fromJson(
      (j['settings']! as Map).cast<String, Object?>(),
    ),
    updatedAt: DateTime.parse(j['updatedAt']! as String),
    createdAt: DateTime.parse(j['createdAt']! as String),
    music: j['music'] == null
        ? null
        : MusicSelection.fromJson((j['music']! as Map).cast<String, Object?>()),
  );

  final String id;
  final List<ReelClip> clips;
  final MusicSelection? music;
  final List<ReelOverlay> overlays;
  final ReelSettings settings;
  final DateTime updatedAt;
  final DateTime createdAt;

  int get clipCount => clips.length;
  int get photoCount => clips.where((c) => c.isPhoto).length;
  bool get isEmpty => clips.isEmpty;

  /// Sum of the clips' lengths (transitions do not add time).
  Duration get totalDuration =>
      clips.fold(Duration.zero, (sum, c) => sum + c.duration);

  ReelDraft copyWith({
    List<ReelClip>? clips,
    MusicSelection? music,
    bool clearMusic = false,
    List<ReelOverlay>? overlays,
    ReelSettings? settings,
    DateTime? updatedAt,
  }) => ReelDraft(
    id: id,
    clips: clips ?? this.clips,
    music: clearMusic ? null : (music ?? this.music),
    overlays: overlays ?? this.overlays,
    settings: settings ?? this.settings,
    updatedAt: updatedAt ?? this.updatedAt,
    createdAt: createdAt,
  );

  Map<String, Object?> toJson() => {
    'id': id,
    'clips': [for (final c in clips) c.toJson()],
    'music': music?.toJson(),
    'overlays': [for (final o in overlays) o.toJson()],
    'settings': settings.toJson(),
    'updatedAt': updatedAt.toIso8601String(),
    'createdAt': createdAt.toIso8601String(),
  };

  @override
  List<Object?> get props => [
    id,
    clips,
    music,
    overlays,
    settings,
    updatedAt,
    createdAt,
  ];
}
