import 'dart:async';

import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/profile_controllers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_providers.dart';
import 'package:blocks_app/features/reel_studio/application/reel_publisher.dart';
import 'package:blocks_app/features/reels/application/reels_controller.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final reelPublisherProvider = FutureProvider<ReelPublisher>((ref) async {
  final config = await ref.watch(reelConfigProvider.future);
  return ReelPublisher(
    processing: ref.watch(mediaProcessingRepositoryProvider),
    upload: ref.watch(mediaUploadRepositoryProvider),
    publish: ref.watch(reelPublishRepositoryProvider),
    config: config,
  );
});

class PublishState extends Equatable {
  const PublishState({
    this.progress = const PublishProgress(stage: PublishStage.preparing),
    this.isRunning = false,
    this.attempt = 0,
  });

  final PublishProgress progress;
  final bool isRunning;

  /// 1 for the first try, 2+ for retries.
  final int attempt;

  PublishStage get stage => progress.stage;
  bool get hasFailed => stage == PublishStage.failed;
  bool get isPublished => stage == PublishStage.published;

  @override
  List<Object?> get props => [progress, isRunning, attempt];
}

/// Drives one publish. The edit is saved as a draft **before** anything is
/// sent and stays saved until the reel is live, so a failure at any stage
/// (no signal, app killed, moderation) never loses the creator's work.
class ReelPublishController extends Notifier<PublishState> {
  StreamSubscription<PublishProgress>? _sub;
  Completer<void>? _done;
  ReelDraft? _draft;
  MediaProfile _profile = MediaProfile.balanced;

  @override
  PublishState build() {
    ref.onDispose(() => unawaited(_sub?.cancel()));
    return const PublishState();
  }

  Future<void> start(ReelDraft draft, MediaProfile profile) async {
    _draft = draft;
    _profile = profile;
    await _begin();
  }

  /// Tries again from the beginning; uploads resume where they stopped.
  Future<void> retry() => _begin();

  Future<void> _begin() async {
    final draft = _draft;
    // Nothing to cancel first: a run that is not running has already ended.
    if (draft == null || state.isRunning) return;

    state = PublishState(isRunning: true, attempt: state.attempt + 1);
    // Safety net: the work is on disk before the first byte is sent.
    await ref.read(reelDraftRepositoryProvider).save(draft);
    if (!ref.mounted) return;
    ref.invalidate(reelDraftsProvider);

    final publisher = await ref.read(reelPublisherProvider.future);
    if (!ref.mounted) return;
    final done = _done = Completer<void>();
    Future<void>? cleanup;
    _sub = publisher
        .run(draft, _profile)
        .listen(
          (p) {
            state = PublishState(
              progress: p,
              isRunning: !p.isTerminal,
              attempt: state.attempt,
            );
            if (p.stage == PublishStage.published) cleanup = _onPublished();
          },
          onError: (Object _, StackTrace _) {
            state = PublishState(
              progress: const PublishProgress(
                stage: PublishStage.failed,
                failureCode: 'unknown',
              ),
              attempt: state.attempt,
            );
            if (!done.isCompleted) done.complete();
          },
          onDone: () async {
            // The draft is removed before we report "finished".
            await cleanup;
            if (!done.isCompleted) done.complete();
          },
        );
    await done.future;
  }

  /// Stops an unfinished publish. The draft stays saved; nothing is lost.
  Future<void> cancel() async {
    final sub = _sub;
    _sub = null;
    if (sub != null) unawaited(sub.cancel());
    state = PublishState(
      progress: const PublishProgress(
        stage: PublishStage.failed,
        failureCode: 'cancelled',
      ),
      attempt: state.attempt,
    );
    final d = _done;
    if (d != null && !d.isCompleted) d.complete();
  }

  Future<void> _onPublished() async {
    final draft = _draft;
    if (draft != null) {
      await ref.read(reelDraftRepositoryProvider).delete(draft.id);
    }
    if (!ref.mounted) return;
    ref
      ..invalidate(reelDraftsProvider)
      ..invalidate(reelsControllerProvider)
      ..invalidate(userReelsProvider)
      ..invalidate(currentUserProvider);
  }
}

final reelPublishProvider =
    NotifierProvider.autoDispose<ReelPublishController, PublishState>(
      ReelPublishController.new,
    );
