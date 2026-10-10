import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/services/photo_picker.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/profile/domain/photo_rules.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum PhotoPhase { idle, uploading, done, removed, failed }

enum PhotoFailure { unsupported, tooLarge, network, pick, other }

class PhotoUploadState extends Equatable {
  const PhotoUploadState({
    this.phase = PhotoPhase.idle,
    this.progress = 0,
    this.failure,
    this.lastPhoto,
  });

  final PhotoPhase phase;

  /// 0..1 while uploading.
  final double progress;
  final PhotoFailure? failure;

  /// Kept so a failed upload can be retried without picking again.
  final PickedPhoto? lastPhoto;

  bool get isUploading => phase == PhotoPhase.uploading;

  @override
  List<Object?> get props => [phase, progress, failure, lastPhoto];
}

/// Profile photo: choose (camera / gallery) -> check -> upload with progress
/// -> done, with a clear failure state and a retry. The upload itself is the
/// repository's job (signed URL -> private storage -> CDN in production).
class PhotoUploadController extends Notifier<PhotoUploadState> {
  @override
  PhotoUploadState build() => const PhotoUploadState();

  Future<void> choose(PhotoSource source) async {
    if (state.isUploading) return;
    final PickedPhoto? photo;
    try {
      photo = await ref.read(profilePhotoPickerProvider).pick(source);
    } on PhotoPickFailure {
      state = const PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: PhotoFailure.pick,
      );
      return;
    }
    if (photo == null) return; // the user backed out

    final problem = PhotoRules.validate(photo);
    if (problem != null) {
      state = PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: problem == PhotoError.tooLarge
            ? PhotoFailure.tooLarge
            : PhotoFailure.unsupported,
        lastPhoto: photo,
      );
      return;
    }
    await _upload(photo);
  }

  Future<void> retry() async {
    final photo = state.lastPhoto;
    if (photo == null || state.isUploading) return;
    await _upload(photo);
  }

  Future<void> _upload(PickedPhoto photo) async {
    state = PhotoUploadState(phase: PhotoPhase.uploading, lastPhoto: photo);
    try {
      await for (final p
          in ref.read(profileRepositoryProvider).uploadProfilePhoto(photo)) {
        switch (p) {
          case UploadInProgress(:final fraction):
            state = PhotoUploadState(
              phase: PhotoPhase.uploading,
              progress: fraction,
              lastPhoto: photo,
            );
          case UploadComplete():
            ref.invalidate(currentUserProvider);
            state = const PhotoUploadState(phase: PhotoPhase.done);
        }
      }
    } on ValidationFailure catch (f) {
      state = PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: f.message == 'photoTooLarge'
            ? PhotoFailure.tooLarge
            : PhotoFailure.unsupported,
        lastPhoto: photo,
      );
    } on NetworkFailure {
      state = PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: PhotoFailure.network,
        lastPhoto: photo,
      );
    } on Object {
      state = PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: PhotoFailure.other,
        lastPhoto: photo,
      );
    }
  }

  Future<void> remove() async {
    if (state.isUploading) return;
    try {
      await ref.read(profileRepositoryProvider).removeProfilePhoto();
      ref.invalidate(currentUserProvider);
      state = const PhotoUploadState(phase: PhotoPhase.removed);
    } on Object {
      state = const PhotoUploadState(
        phase: PhotoPhase.failed,
        failure: PhotoFailure.other,
      );
    }
  }

  /// Hide a finished / failed status.
  void dismiss() {
    if (!state.isUploading) state = const PhotoUploadState();
  }
}

final photoUploadControllerProvider =
    NotifierProvider<PhotoUploadController, PhotoUploadState>(
      PhotoUploadController.new,
    );
