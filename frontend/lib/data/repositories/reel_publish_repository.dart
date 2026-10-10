import 'package:blocks_app/data/models/media_models.dart';
import 'package:blocks_app/data/models/reel_models.dart';

/// The server side of publishing a reel.
///
/// The client prepares and uploads the media (see `MediaProcessingRepository`
/// and `MediaUploadRepository`), then asks the server to build the reel.
/// Everything after that happens on the server and is only *watched* here:
///
/// * transcoding to the delivery ladder (720p / 1080p / ...), thumbnails, HLS;
/// * safety, copyright and policy moderation;
/// * creating the reel and entering it into District discovery.
abstract interface class ReelPublishRepository {
  /// Hands the finished uploads and the edit to the server. The server
  /// re-validates everything, including limits the client already checked.
  Future<PublishJob> submit(ReelDraft draft, List<UploadReceipt> uploads);

  /// Server-side progress until it reaches a terminal state. A production
  /// client uses push or long-polling for this.
  Stream<PublishJobStatus> watch(String jobId);
}
