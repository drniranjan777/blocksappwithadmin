import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/content_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/data/repositories/reel_repository.dart';
import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:blocks_app/features/reels/domain/reel_playback.dart';
import 'package:blocks_app/features/reels/presentation/demo_reel_playback.dart';
import 'package:blocks_app/features/settings/application/app_settings.dart';
import 'package:flutter/scheduler.dart' show TickerProvider;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// "For You" or "Following" at the top of the Reels screen.
class ReelsFeedSelection extends Notifier<ReelFeed> {
  @override
  ReelFeed build() => ReelFeed.forYou;

  void select(ReelFeed feed) => state = feed;
}

final reelsFeedProvider = NotifierProvider<ReelsFeedSelection, ReelFeed>(
  ReelsFeedSelection.new,
);

class ReelsController extends PagedNotifier<Reel> {
  @override
  Future<PagedState<Reel>> build() {
    // Switching tab refetches from the first page.
    ref.watch(reelsFeedProvider);
    return super.build();
  }

  @override
  Future<PagedResult<Reel>> fetchPage(String? cursor) => ref
      .read(reelRepositoryProvider)
      .getReels(cursor: cursor, limit: 8, feed: ref.read(reelsFeedProvider));
}

final reelsControllerProvider =
    AsyncNotifierProvider<ReelsController, PagedState<Reel>>(
      ReelsController.new,
    );

/// Reel sound. **Muted by default**, and a fresh app session always starts
/// muted (`AppFlag.reelsSoundEnabled` is session-only). Tapping the sound
/// button is the only thing that ever turns audio on; the choice then carries
/// over to every following reel until the app is closed.
///
/// State is `isMuted`; the single source of truth is [AppSettings], so there
/// is no separate, unmanaged global.
class ReelsAudioController extends Notifier<bool> {
  @override
  bool build() => !ref.watch(
    appSettingsProvider.select((s) => s.isOn(AppFlag.reelsSoundEnabled)),
  );

  bool get isMuted => state;

  Future<void> toggleMute() => setMuted(muted: !state);

  Future<void> setMuted({required bool muted}) => ref
      .read(appSettingsProvider.notifier)
      .setFlag(AppFlag.reelsSoundEnabled, value: !muted);
}

final reelsMutedProvider = NotifierProvider<ReelsAudioController, bool>(
  ReelsAudioController.new,
);

/// How a reel becomes playable. Production overrides this with a
/// `video_player`/HLS implementation; tests override it with a counter.
typedef ReelPlaybackBuilder = ReelPlayback Function(
  Reel reel,
  TickerProvider vsync,
);

final reelPlaybackBuilderProvider = Provider<ReelPlaybackBuilder>((ref) {
  final sound = ref.watch(reelSoundEngineProvider);
  return (reel, vsync) => DemoReelPlayback(reel, vsync, sound: sound);
});
