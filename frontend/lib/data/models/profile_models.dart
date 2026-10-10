import 'dart:typed_data';

import 'package:equatable/equatable.dart';

enum Gender { female, male, nonBinary, preferNotToSay }

/// What the service lets a person edit about themselves, so the form offers only
/// what can be saved. The demo allows everything.
class ProfileCapabilities extends Equatable {
  const ProfileCapabilities({
    this.canChangeUsername = true,
    this.canEditDateOfBirth = true,
  });

  final bool canChangeUsername;
  final bool canEditDateOfBirth;

  @override
  List<Object?> get props => [canChangeUsername, canEditDateOfBirth];
}

/// Details only the account owner can see. Kept apart from the public
/// [AppUser] so they cannot leak into a post, comment or search result.
class PrivateProfile extends Equatable {
  const PrivateProfile({this.dateOfBirth, this.gender});

  final DateTime? dateOfBirth;
  final Gender? gender;

  @override
  List<Object?> get props => [dateOfBirth, gender];
}

/// The editable profile as sent to the server. The server re-validates every
/// field; the client checks are only for fast feedback.
class ProfileUpdate extends Equatable {
  const ProfileUpdate({
    required this.name,
    required this.username,
    required this.bio,
    required this.country,
    required this.state,
    required this.district,
    this.website,
    this.dateOfBirth,
    this.gender,
  });

  final String name;

  /// Without the leading "@".
  final String username;
  final String bio;
  final String? website;
  final String country;
  final String state;
  final String district;
  final DateTime? dateOfBirth;
  final Gender? gender;

  @override
  List<Object?> get props => [
    name,
    username,
    bio,
    website,
    country,
    state,
    district,
    dateOfBirth,
    gender,
  ];
}

/// A photo chosen on the device, before it is uploaded.
///
/// The declared [mimeType] and [fileName] are only hints: the server checks the
/// real content, re-encodes the image and picks its own safe filename.
class PickedPhoto extends Equatable {
  const PickedPhoto({
    required this.bytes,
    required this.fileName,
    required this.mimeType,
  });

  final Uint8List bytes;
  final String fileName;
  final String mimeType;

  int get sizeBytes => bytes.length;

  @override
  List<Object?> get props => [fileName, mimeType, sizeBytes];
}

/// Progress of an upload: some [UploadInProgress] updates, then one
/// [UploadComplete] — or the stream fails with an `AppFailure`.
sealed class UploadProgress {
  const UploadProgress();
}

class UploadInProgress extends UploadProgress {
  const UploadInProgress(this.fraction);

  /// 0..1.
  final double fraction;
}

class UploadComplete extends UploadProgress {
  const UploadComplete(this.avatarUrl);

  /// Where the new photo is served from (a CDN URL in production).
  final String avatarUrl;
}
