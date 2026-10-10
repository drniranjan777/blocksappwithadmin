import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/l10n/gen/app_localizations.dart';

extension PostAudienceLabels on PostAudience {
  String label(AppLocalizations l10n) => switch (this) {
    PostAudience.everyone => l10n.audienceEveryone,
    PostAudience.followers => l10n.audienceFollowers,
    PostAudience.closeFriends => l10n.audienceCloseFriends,
    PostAudience.private => l10n.audiencePrivate,
  };
}

extension PostDraftErrorLabels on PostDraftError {
  String message(AppLocalizations l10n) => switch (this) {
    PostDraftError.captionTooLong => l10n.createErrorCaptionTooLong,
    PostDraftError.captionRequired => l10n.createErrorCaptionRequired,
    PostDraftError.mediaRequired => l10n.createErrorMediaRequired,
    PostDraftError.tooManyHashtags => l10n.createErrorTooManyHashtags,
    PostDraftError.locationRequired => l10n.createErrorLocationRequired,
  };
}
