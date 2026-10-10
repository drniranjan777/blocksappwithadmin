/// Which ids are reels.
///
/// The home feed mixes posts and reels in one list of `Post`s, but liking,
/// saving, sharing and commenting go to different routes for each. Whoever turns
/// a reel into a feed item records its id here, so a later like on it goes to
/// `/reels/:id/like` rather than failing against `/posts/:id/like`.
///
/// Bounded: only the most recently seen [capacity] ids are remembered, which is
/// far more than a session scrolls past. An id that has been forgotten is still
/// handled (the post repository falls back when a post is not found).
class ContentKinds {
  ContentKinds({this.capacity = 5000});

  final int capacity;

  // A LinkedHashSet: iteration order is insertion order, so `first` is oldest.
  final Set<String> _reels = {};

  bool isReel(String id) => _reels.contains(id);

  void markReel(String id) {
    _reels
      ..remove(id)
      ..add(id);
    if (_reels.length > capacity) _reels.remove(_reels.first);
  }
}
