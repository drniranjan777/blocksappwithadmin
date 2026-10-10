import 'dart:async';

import 'package:blocks_app/features/reels/audio/reel_sound_engine.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Audio for music previews in the editor. It is its own engine (and so its
/// own native player, created only when a preview is first played) so it never
/// competes with the Reels feed's single shared player.
///
/// The demo plays a generated loop for the track's `previewSeed`; a real build
/// streams a licensed preview clip from the CDN behind the same interface.
final studioSoundEngineProvider = Provider.autoDispose<ReelSoundEngine>((ref) {
  final engine = ReelSoundEngine(cacheSize: 2);
  ref.onDispose(() => unawaited(engine.dispose()));
  return engine;
});
