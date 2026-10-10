import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bumped when something changes what content the user may see (block, mute,
/// ...). Paged controllers watch it, so every feed, grid and story tray
/// refreshes itself without the safety code knowing about them.
class ContentEpoch extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final contentEpochProvider = NotifierProvider<ContentEpoch, int>(
  ContentEpoch.new,
);
