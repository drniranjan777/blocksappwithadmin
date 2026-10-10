import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/api/api_client.dart';
import 'package:blocks_app/data/api/content_kinds.dart';
import 'package:blocks_app/data/api/json_reader.dart';
import 'package:blocks_app/data/api/media_uploader.dart';
import 'package:blocks_app/data/api/mappers.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/repositories/post_repository.dart';

/// Posts, comments and engagement against the real API.
///
/// The home feed shows reels as video `Post`s, so an id handed to this class may
/// belong to a reel. Those go to `/reels/...` (the feed records them in
/// [ContentKinds]); an id that is not known to be a reel is tried as a post
/// first and, if the server says it is not a post, as a reel.
class ApiPostRepository implements PostRepository {
  ApiPostRepository(this._api, this._floor, this._kinds, this._uploader);

  final ApiClient _api;
  final Future<ReachFloor> Function() _floor;
  final ContentKinds _kinds;
  final MediaUploader _uploader;

  /// A submission that may or may not have reached the server, kept so that
  /// pressing "Post" again sends the same Idempotency-Key and cannot publish the
  /// post twice. Forgotten as soon as the outcome is known.
  final Map<PostDraft, String> _pendingKeys = {};

  /// A photo already uploaded for a draft, so pressing "Post" again after the
  /// post itself failed does not send the picture a second time.
  final Map<PostDraft, String> _uploadedPhotos = {};

  // ---------------------------------------------------------------- read --

  @override
  Future<Post> getPost(String id) async {
    final floor = await _floor();
    if (!_kinds.isReel(id)) {
      try {
        final answer = await _api.get('/posts/${seg(id)}');
        final view = JsonObject.of(answer.data);
        return postFromView(
          view,
          floor: floor,
          qualifiedReach: await _ownReach(view, 'post'),
        );
      } on NotFoundFailure {
        // Perhaps a reel the feed has not shown yet: fall through.
      }
    }
    final answer = await _api.get('/reels/${seg(id)}');
    final reel = JsonObject.of(answer.data);
    _kinds.markReel(reel.string('id'));
    return postFromReelView(
      reel,
      floor: floor,
      qualifiedReach: await _ownReach(reel, 'reel'),
    );
  }

  /// The real qualified reach of the author's own post or reel. The server shows
  /// the count to its author only, so for anyone else this is null and the rung
  /// alone is shown.
  Future<int?> _ownReach(JsonObject view, String kind) async {
    if (view.objectOrNull('viewer')?.boolean('isAuthor') != true) return null;
    try {
      final answer = await _api.get(
        '/reach/content/$kind/${seg(view.string('id'))}',
      );
      return answer.object().integer('qualifiedReach');
    } on AppFailure {
      // The detail still shows without the number.
      return null;
    }
  }

  @override
  Future<PagedResult<Post>> getUserPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async {
    final answer = await _api.get(
      '/profiles/${seg(userId)}/posts',
      query: {'cursor': cursor, 'limit': clampPage(limit)},
    );
    final floor = await _floor();
    return PagedResult(
      items: [for (final v in answer.objects()) postFromView(v, floor: floor)],
      nextCursor: answer.hasMore ? answer.nextCursor : null,
    );
  }

  /// The API does not record who is tagged in a post (it notifies a mentioned
  /// person but keeps no list), so there is nothing to show here yet.
  @override
  Future<PagedResult<Post>> getTaggedPosts(
    String userId, {
    String? cursor,
    int limit = 18,
  }) async => const PagedResult.empty();

  // ---------------------------------------------------------- engagement --

  /// Runs [action] against `/posts/:id/...`, or `/reels/:id/...` for a reel.
  Future<void> _engage(
    String id,
    Future<void> Function(String base) action,
  ) async {
    if (_kinds.isReel(id)) return action('/reels/${seg(id)}');
    try {
      await action('/posts/${seg(id)}');
    } on NotFoundFailure {
      // Not a post: it may be a reel this session has not seen yet.
      await action('/reels/${seg(id)}');
      _kinds.markReel(id);
    }
  }

  @override
  Future<void> likePost(String id) =>
      _engage(id, (base) => _api.post('$base/like'));

  @override
  Future<void> unlikePost(String id) =>
      _engage(id, (base) => _api.delete('$base/like'));

  @override
  Future<void> savePost(String id) =>
      _engage(id, (base) => _api.post('$base/save'));

  @override
  Future<void> unsavePost(String id) =>
      _engage(id, (base) => _api.delete('$base/save'));

  @override
  Future<void> sharePost(String id) => _engage(
    id,
    (base) => _api.post('$base/share', body: {'channel': 'LINK'}),
  );

  // ------------------------------------------------------------ comments --

  Future<T> _onTarget<T>(
    String id,
    Future<T> Function(String base) action,
  ) async {
    if (_kinds.isReel(id)) return action('/reels/${seg(id)}');
    try {
      return await action('/posts/${seg(id)}');
    } on NotFoundFailure {
      final result = await action('/reels/${seg(id)}');
      _kinds.markReel(id);
      return result;
    }
  }

  @override
  Future<PagedResult<Comment>> getComments(
    String postId, {
    String? cursor,
    int limit = 20,
  }) => _onTarget(postId, (base) async {
    final answer = await _api.get(
      '$base/comments',
      query: {'cursor': cursor, 'limit': clampPage(limit)},
    );
    return PagedResult(
      items: [for (final c in answer.objects()) commentFromView(c)],
      nextCursor: answer.hasMore ? answer.nextCursor : null,
    );
  });

  @override
  Future<Comment> addComment(String postId, String text) async {
    final body = text.trim();
    if (body.isEmpty) {
      throw const ValidationFailure('Write something first');
    }
    return _onTarget(postId, (base) async {
      final answer = await _api.post(
        '$base/comments',
        body: {'body': body},
        idempotencyKey: newIdempotencyKey(),
      );
      return commentFromView(JsonObject.of(answer.data));
    });
  }

  // -------------------------------------------------------------- create --

  static String _visibility(PostAudience a) => switch (a) {
    PostAudience.everyone => 'PUBLIC',
    PostAudience.followers => 'FOLLOWERS',
    PostAudience.closeFriends => 'CLOSE_FRIENDS',
    PostAudience.private => 'PRIVATE',
  };

  /// Publishes a text or photo post. Where it was made (district, state) is
  /// taken from the author's profile by the server, never from the draft.
  ///
  /// A photo is uploaded first (and checked and re-encoded by the server), then
  /// the post refers to it. Video posts are not offered: videos are reels.
  @override
  Future<Post> createPost(PostDraft draft) async {
    if (draft.type == PostType.video) {
      throw const ValidationFailure(
        'Videos are published as reels',
        'USE_REELS',
      );
    }
    final isPhoto = draft.type == PostType.image;
    final caption = draft.caption.trim();
    if (!isPhoto && caption.isEmpty) {
      throw const ValidationFailure('Write something first');
    }
    if (isPhoto && draft.photo == null) {
      throw const ValidationFailure('Choose a photo first', 'PHOTO_REQUIRED');
    }

    final key = _pendingKeys.putIfAbsent(draft, newIdempotencyKey);
    final ApiEnvelope answer;
    try {
      final mediaId = isPhoto ? await _uploadPhoto(draft) : null;
      answer = await _api.post(
        '/posts',
        body: {
          'type': isPhoto ? 'PHOTO' : 'TEXT',
          'caption': caption,
          'visibility': _visibility(draft.audience),
          if (mediaId != null) 'mediaIds': [mediaId],
        },
        idempotencyKey: key,
      );
    } on AppFailure catch (e) {
      // Only an outright refusal ends the attempt. If the connection dropped or
      // the server stumbled, the post may exist: the next try reuses the key
      // and so returns it instead of publishing a second one.
      if (_refusedOutright(e)) _pendingKeys.remove(draft);
      rethrow;
    }
    _pendingKeys.remove(draft);
    _uploadedPhotos.remove(draft);
    return postFromView(answer.object(), floor: await _floor());
  }

  /// Sends the draft's photo and returns its media id. The keys the post screen
  /// understands for a refusal: `photoTooLarge`, `photoUnsupported`.
  Future<String> _uploadPhoto(PostDraft draft) async {
    final known = _uploadedPhotos[draft];
    if (known != null) return known;
    final photo = draft.photo!;
    try {
      final media = await _uploader.uploadAndWait(
        purpose: MediaPurpose.postImage,
        kind: MediaKind.image,
        contentType: photo.mimeType,
        source: UploadSource.bytes(photo.bytes),
      );
      return _uploadedPhotos[draft] = media.id;
    } on AppFailure catch (e) {
      if (e.code == 'PAYLOAD_TOO_LARGE') {
        throw const ValidationFailure('photoTooLarge');
      }
      if (e.code == 'UNSUPPORTED_MEDIA' || e.message == 'mediaRejected') {
        throw const ValidationFailure('photoUnsupported');
      }
      rethrow;
    }
  }

  static bool _refusedOutright(AppFailure e) =>
      e is ValidationFailure ||
      e is FieldValidationFailure ||
      e is ForbiddenFailure ||
      e is UnauthorizedFailure ||
      e is NotFoundFailure ||
      e is RateLimitedFailure;
}
