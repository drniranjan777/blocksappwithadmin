import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/music_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Server-controlled reel limits.
final reelConfigProvider = FutureProvider<ReelConfig>(
  (ref) => ref.watch(creatorConfigRepositoryProvider).getReelConfig(),
);

/// The creator's saved drafts, newest edited first.
class ReelDraftsController extends AsyncNotifier<List<ReelDraft>> {
  @override
  Future<List<ReelDraft>> build() =>
      ref.watch(reelDraftRepositoryProvider).list();

  Future<void> delete(String id) async {
    await ref.read(reelDraftRepositoryProvider).delete(id);
    ref.invalidateSelf();
    await future;
  }

  Future<ReelDraft> duplicate(String id) async {
    final copy = await ref.read(reelDraftRepositoryProvider).duplicate(id);
    ref.invalidateSelf();
    await future;
    return copy;
  }
}

final reelDraftsProvider =
    AsyncNotifierProvider<ReelDraftsController, List<ReelDraft>>(
      ReelDraftsController.new,
    );

/// What the "gallery" offers right now.
final mediaLibraryProvider = FutureProvider.autoDispose<List<MediaAsset>>(
  (ref) => ref.watch(mediaLibraryRepositoryProvider).getLibrary(),
);

final trendingMusicProvider = FutureProvider.autoDispose<List<MusicTrack>>(
  (ref) => ref.watch(musicRepositoryProvider).getTrending(),
);
