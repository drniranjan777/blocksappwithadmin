import 'package:blocks_app/data/models/reel_models.dart';

/// Reel drafts. A draft is the *edit* (clip order, trims, look, text, music),
/// not the media itself.
///
/// Demo: kept on the device. Production: the app keeps a local copy for
/// offline editing and syncs it with the server so drafts follow the creator
/// across devices.
abstract interface class ReelDraftRepository {
  /// Newest edited first.
  Future<List<ReelDraft>> list();

  Future<ReelDraft?> get(String id);

  /// Creates or replaces.
  Future<void> save(ReelDraft draft);

  Future<void> delete(String id);

  /// A copy with a new id; the original is untouched.
  Future<ReelDraft> duplicate(String id);
}
