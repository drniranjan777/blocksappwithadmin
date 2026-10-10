import 'package:blocks_app/app/config/app_config.dart';
import 'package:blocks_app/core/constants/demo_media.dart';
import 'package:blocks_app/core/constants/districts.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/create/domain/live_eligibility.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/features/home/application/feed_controller.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/stories/application/story_controller.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ------------------------------------------------------------------ Post --

/// Why publishing a post did not work, as the screen needs to say it.
enum PostSubmitError {
  network,
  restricted,
  rateLimited,
  photoTooLarge,
  photoUnsupported,
  other,
}

class CreatePostState extends Equatable {
  const CreatePostState({
    required this.district,
    required this.state,
    this.type = PostType.image,
    this.mediaSeed,
    this.photo,
    this.caption = '',
    this.audience = PostAudience.everyone,
    this.isSubmitting = false,
    this.errors = const [],
    this.showErrors = false,
    this.submitError,
  });

  final PostType type;
  final int? mediaSeed;

  /// A photo chosen on the device (with the live service).
  final PickedPhoto? photo;
  final PostSubmitError? submitError;
  final String caption;
  final String district;
  final String state;
  final PostAudience audience;
  final bool isSubmitting;
  final List<PostDraftError> errors;
  final bool showErrors;

  PostDraft get draft => PostDraft(
    type: type,
    mediaUrl: type == PostType.text || mediaSeed == null
        ? null
        : demoPhotoUrl(mediaSeed!),
    photo: type == PostType.text ? null : photo,
    caption: caption,
    district: district,
    state: state,
    audience: audience,
  );

  CreatePostState copyWith({
    PostType? type,
    int? mediaSeed,
    PickedPhoto? photo,
    bool clearMedia = false,
    PostSubmitError? submitError,
    bool clearSubmitError = false,
    String? caption,
    String? district,
    String? state,
    PostAudience? audience,
    bool? isSubmitting,
    List<PostDraftError>? errors,
    bool? showErrors,
  }) {
    return CreatePostState(
      type: type ?? this.type,
      mediaSeed: clearMedia ? null : (mediaSeed ?? this.mediaSeed),
      photo: clearMedia ? null : (photo ?? this.photo),
      caption: caption ?? this.caption,
      district: district ?? this.district,
      state: state ?? this.state,
      audience: audience ?? this.audience,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      errors: errors ?? this.errors,
      showErrors: showErrors ?? this.showErrors,
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
    );
  }

  @override
  List<Object?> get props => [
    type,
    mediaSeed,
    photo,
    submitError,
    caption,
    district,
    state,
    audience,
    isSubmitting,
    errors,
    showErrors,
  ];
}

/// Resets automatically when the Create Post screen closes (auto-dispose).
class CreatePostController extends Notifier<CreatePostState> {
  /// With the live service a post is tagged with the place on the author's
  /// profile, so the post form asks for none.
  bool get _live => !ref.read(appConfigProvider).useMockData;

  @override
  CreatePostState build() {
    final me = ref.read(currentUserProvider).value;
    final live = !ref.read(appConfigProvider).useMockData;
    return CreatePostState(
      district: me?.district ?? (live ? '' : 'Hyderabad'),
      state: me?.state ?? (live ? '' : 'Telangana'),
    );
  }

  List<PostDraftError> _validate(CreatePostState s) =>
      PostDraftValidator.validate(s.draft, requireLocation: !_live);

  void _update(CreatePostState next) {
    state = next.showErrors
        ? next.copyWith(errors: _validate(next), clearSubmitError: true)
        : next.copyWith(clearSubmitError: true);
  }

  void setType(PostType type) =>
      _update(state.copyWith(type: type, clearMedia: type == PostType.text));
  void selectMedia(int seed) => _update(state.copyWith(mediaSeed: seed));
  void setPhoto(PickedPhoto photo) => _update(state.copyWith(photo: photo));
  void setCaption(String value) => _update(state.copyWith(caption: value));
  void setAudience(PostAudience a) => state = state.copyWith(audience: a);
  void setLocation(District d) =>
      _update(state.copyWith(district: d.name, state: d.state));

  /// Returns true when the post was published.
  Future<bool> submit() async {
    if (state.isSubmitting) return false;
    final errors = _validate(state);
    if (errors.isNotEmpty) {
      state = state.copyWith(errors: errors, showErrors: true);
      return false;
    }
    state = state.copyWith(isSubmitting: true, clearSubmitError: true);
    try {
      await ref.read(postRepositoryProvider).createPost(state.draft);
      ref
        ..invalidate(feedControllerProvider)
        ..invalidate(userPostsProvider)
        ..invalidate(currentUserProvider);
      ref.read(selectedFeedProvider.notifier).select(FeedType.forYou);
      return true;
    } on AppFailure catch (f) {
      state = state.copyWith(
        isSubmitting: false,
        submitError: _submitErrorOf(f),
      );
      return false;
    }
  }

  static PostSubmitError _submitErrorOf(AppFailure f) {
    if (f is NetworkFailure || f is ServiceUnavailableFailure) {
      return PostSubmitError.network;
    }
    if (f is RateLimitedFailure) return PostSubmitError.rateLimited;
    if (f is ForbiddenFailure &&
        (f.code == 'ACCOUNT_RESTRICTED' || f.code == 'ACCOUNT_SUSPENDED')) {
      return PostSubmitError.restricted;
    }
    if (f is ValidationFailure) {
      if (f.message == 'photoTooLarge') return PostSubmitError.photoTooLarge;
      if (f.message == 'photoUnsupported') {
        return PostSubmitError.photoUnsupported;
      }
    }
    return PostSubmitError.other;
  }
}

final createPostControllerProvider =
    NotifierProvider.autoDispose<CreatePostController, CreatePostState>(
      CreatePostController.new,
    );

// ----------------------------------------------------------------- Story --

class CreateStoryState extends Equatable {
  const CreateStoryState({
    this.mediaSeed = 0,
    this.text = '',
    this.isSubmitting = false,
  });

  final int mediaSeed;
  final String text;
  final bool isSubmitting;

  CreateStoryState copyWith({
    int? mediaSeed,
    String? text,
    bool? isSubmitting,
  }) => CreateStoryState(
    mediaSeed: mediaSeed ?? this.mediaSeed,
    text: text ?? this.text,
    isSubmitting: isSubmitting ?? this.isSubmitting,
  );

  @override
  List<Object?> get props => [mediaSeed, text, isSubmitting];
}

class CreateStoryController extends Notifier<CreateStoryState> {
  @override
  CreateStoryState build() => const CreateStoryState(mediaSeed: 1101); // first demo-gallery tile

  void selectMedia(int seed) => state = state.copyWith(mediaSeed: seed);
  void setText(String v) => state = state.copyWith(text: v);

  Future<void> submit() async {
    state = state.copyWith(isSubmitting: true);
    try {
      await ref
          .read(storyControllerProvider.notifier)
          .addStory(
            mediaUrl: demoPhotoUrl(state.mediaSeed),
            caption: state.text,
          );
    } finally {
      state = state.copyWith(isSubmitting: false);
    }
  }
}

final createStoryControllerProvider =
    NotifierProvider.autoDispose<CreateStoryController, CreateStoryState>(
      CreateStoryController.new,
    );

// ------------------------------------------------------------------ Live --

/// Thresholds are configuration, never constants in the UI.
final liveEligibilityConfigProvider = Provider<LiveEligibilityConfig>(
  (_) => const LiveEligibilityConfig.demo(),
);

final liveEligibilityProvider = Provider<AsyncValue<LiveEligibilityResult>>((
  ref,
) {
  final evaluator = LiveEligibilityEvaluator(
    ref.watch(liveEligibilityConfigProvider),
  );
  return ref.watch(currentUserProvider).whenData(evaluator.evaluate);
});
