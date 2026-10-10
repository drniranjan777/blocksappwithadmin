import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';

enum TrustStatus { eligible, underReview, restricted }

enum VerificationType { identity, business, creator, publisher }

/// The small slice of a user shown on cards, comments and lists.
class UserSummary extends Equatable {
  const UserSummary({
    required this.id,
    required this.name,
    required this.username,
    this.avatarUrl,
    this.isVerified = false,
  });

  final String id;
  final String name;
  final String username;
  final String? avatarUrl;
  final bool isVerified;

  @override
  List<Object?> get props => [id, name, username, avatarUrl, isVerified];
}

class AppUser extends Equatable {
  const AppUser({
    required this.id,
    required this.name,
    required this.username,
    required this.bio,
    required this.district,
    required this.state,
    required this.followersCount,
    required this.followingCount,
    required this.postsCount,
    required this.reachLevel,
    this.bestPostReach = 0,
    this.avatarUrl,
    this.isVerified = false,
    this.verificationType,
    this.trustStatus = TrustStatus.eligible,
    this.accountAgeDays = 0,
    this.isTwoFactorEnabled = false,
    this.hasMajorViolation = false,
    this.isAgeEligible = true,
    this.businessId,
    this.website,
    this.country = 'India',
  });

  final String id;
  final String name;

  /// Includes the leading "@", e.g. "@aarav.blocks".
  final String username;
  final String bio;
  final String? avatarUrl;
  final String district;
  final String state;
  final int followersCount;
  final int followingCount;
  final int postsCount;
  final bool isVerified;
  final VerificationType? verificationType;
  final ReachLevel reachLevel;

  /// Qualified reach of the user's best post; drives the profile ladder.
  final int bestPostReach;
  final TrustStatus trustStatus;
  final int accountAgeDays;
  final bool isTwoFactorEnabled;
  final bool hasMajorViolation;
  final bool isAgeEligible;

  /// Set when this user owns a Business Profile.
  final String? businessId;

  /// Public link shown on the profile (optional, normalised to https).
  final String? website;
  final String country;

  String get location => '$district, $state';

  UserSummary get summary => UserSummary(
    id: id,
    name: name,
    username: username,
    avatarUrl: avatarUrl,
    isVerified: isVerified,
  );

  /// Applies an edited public profile. [avatarUrl] replaces the photo;
  /// [clearAvatar] removes it (a null [avatarUrl] alone means "unchanged").
  AppUser withProfile({
    String? name,
    String? username,
    String? bio,
    String? website,
    bool clearWebsite = false,
    String? country,
    String? state,
    String? district,
    String? avatarUrl,
    bool clearAvatar = false,
  }) {
    return AppUser(
      id: id,
      name: name ?? this.name,
      username: username ?? this.username,
      bio: bio ?? this.bio,
      avatarUrl: clearAvatar ? null : (avatarUrl ?? this.avatarUrl),
      district: district ?? this.district,
      state: state ?? this.state,
      followersCount: followersCount,
      followingCount: followingCount,
      postsCount: postsCount,
      isVerified: isVerified,
      verificationType: verificationType,
      reachLevel: reachLevel,
      bestPostReach: bestPostReach,
      trustStatus: trustStatus,
      accountAgeDays: accountAgeDays,
      isTwoFactorEnabled: isTwoFactorEnabled,
      hasMajorViolation: hasMajorViolation,
      isAgeEligible: isAgeEligible,
      businessId: businessId,
      website: clearWebsite ? null : (website ?? this.website),
      country: country ?? this.country,
    );
  }

  AppUser copyWith({
    int? followersCount,
    int? followingCount,
    int? postsCount,
    bool? isVerified,
    VerificationType? verificationType,
    bool? isTwoFactorEnabled,
    TrustStatus? trustStatus,
    bool? hasMajorViolation,
    int? accountAgeDays,
    ReachLevel? reachLevel,
    int? bestPostReach,
  }) {
    return AppUser(
      id: id,
      name: name,
      username: username,
      bio: bio,
      avatarUrl: avatarUrl,
      district: district,
      state: state,
      followersCount: followersCount ?? this.followersCount,
      followingCount: followingCount ?? this.followingCount,
      postsCount: postsCount ?? this.postsCount,
      isVerified: isVerified ?? this.isVerified,
      verificationType: verificationType ?? this.verificationType,
      reachLevel: reachLevel ?? this.reachLevel,
      bestPostReach: bestPostReach ?? this.bestPostReach,
      trustStatus: trustStatus ?? this.trustStatus,
      accountAgeDays: accountAgeDays ?? this.accountAgeDays,
      isTwoFactorEnabled: isTwoFactorEnabled ?? this.isTwoFactorEnabled,
      hasMajorViolation: hasMajorViolation ?? this.hasMajorViolation,
      isAgeEligible: isAgeEligible,
      businessId: businessId,
      website: website,
      country: country,
    );
  }

  @override
  List<Object?> get props => [
    id,
    name,
    username,
    bio,
    avatarUrl,
    district,
    state,
    followersCount,
    followingCount,
    postsCount,
    isVerified,
    verificationType,
    reachLevel,
    bestPostReach,
    trustStatus,
    accountAgeDays,
    isTwoFactorEnabled,
    hasMajorViolation,
    isAgeEligible,
    businessId,
    website,
    country,
  ];
}
