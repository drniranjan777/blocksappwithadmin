import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/post.dart';

enum PostDraftError {
  captionTooLong,
  captionRequired,
  mediaRequired,
  tooManyHashtags,
  locationRequired,
}

/// Client-side validation. The server re-validates everything — this exists
/// to give instant, localisable feedback.
abstract final class PostDraftValidator {
  static const maxCaptionLength = 2200;
  static const maxHashtags = 30;

  /// [requireLocation] is false with the live service, which tags a post with
  /// the place on the author's profile and takes none from the post.
  static List<PostDraftError> validate(
    PostDraft draft, {
    bool requireLocation = true,
  }) {
    final errors = <PostDraftError>[];
    final caption = draft.caption.trim();

    if (draft.type == PostType.text) {
      if (caption.isEmpty) errors.add(PostDraftError.captionRequired);
    } else if (draft.photo == null &&
        (draft.mediaUrl == null || draft.mediaUrl!.isEmpty)) {
      errors.add(PostDraftError.mediaRequired);
    }
    if (caption.length > maxCaptionLength) {
      errors.add(PostDraftError.captionTooLong);
    }
    if (extractHashtags(caption).length > maxHashtags) {
      errors.add(PostDraftError.tooManyHashtags);
    }
    if (requireLocation &&
        (draft.district.trim().isEmpty || draft.state.trim().isEmpty)) {
      errors.add(PostDraftError.locationRequired);
    }
    return errors;
  }

  /// Throws [ValidationFailure] with the first error's name.
  static void ensureValid(PostDraft draft) {
    final errors = validate(draft);
    if (errors.isNotEmpty) throw ValidationFailure(errors.first.name);
  }
}

// \p{M} keeps vowel signs/viramas, which Hindi and Telugu words depend on.
final _hashtag = RegExp(r'#[\p{L}\p{M}\p{N}_]+', unicode: true);

/// Unique hashtags in order of appearance, e.g. "#Food #food #Hyd" ->
/// ["#Food", "#Hyd"] (case-insensitive de-duplication).
List<String> extractHashtags(String text) {
  final seen = <String>{};
  final out = <String>[];
  for (final m in _hashtag.allMatches(text)) {
    final tag = m.group(0)!;
    if (seen.add(tag.toLowerCase())) out.add(tag);
  }
  return out;
}
