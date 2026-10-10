import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';

class BusinessProfile extends Equatable {
  const BusinessProfile({
    required this.id,
    required this.name,
    required this.handle,
    required this.category,
    required this.about,
    required this.district,
    required this.state,
    required this.followersCount,
    required this.isVerified,
    required this.phone,
    required this.whatsapp,
    required this.website,
    required this.hours,
    required this.ownerId,
  });

  final String id;
  final String name;
  final String handle;
  final String category;
  final String about;
  final String district;
  final String state;
  final int followersCount;
  final bool isVerified;
  final String phone;
  final String whatsapp;
  final String website;
  final String hours;
  final String ownerId;

  String get location => '$district, $state';

  UserSummary get summary =>
      UserSummary(id: id, name: name, username: handle, isVerified: isVerified);

  @override
  List<Object?> get props => [
    id,
    name,
    handle,
    category,
    about,
    district,
    state,
    followersCount,
    isVerified,
    phone,
    whatsapp,
    website,
    hours,
    ownerId,
  ];
}

class Offer extends Equatable {
  const Offer({
    required this.id,
    required this.title,
    required this.description,
    required this.code,
    required this.validUntil,
    required this.artSeed,
  });

  final String id;
  final String title;
  final String description;
  final String code;
  final DateTime validUntil;
  final int artSeed;

  @override
  List<Object?> get props => [
    id,
    title,
    description,
    code,
    validUntil,
    artSeed,
  ];
}

// ---------------------------------------------------------------- Creator --

class CreatorDashboard extends Equatable {
  const CreatorDashboard({
    required this.followers,
    required this.qualifiedReach30d,
    required this.bestPostQualifiedReach,
    required this.coverage,
    required this.reachLevel,
  });

  final int followers;

  /// Total qualified reach across all posts in the last 30 days.
  final int qualifiedReach30d;

  /// Qualified reach of the creator's best-performing post. Drives the
  /// "next milestone" on the Reach Ladder.
  final int bestPostQualifiedReach;

  /// Share (0-1) of the audience footprint reached at each ladder level.
  final Map<ReachLevel, double> coverage;
  final ReachLevel reachLevel;

  @override
  List<Object?> get props => [
    followers,
    qualifiedReach30d,
    bestPostQualifiedReach,
    coverage,
    reachLevel,
  ];
}

// -------------------------------------------------------------------- Ads --

enum AdGoal { followers, reach, websiteVisits, contact, videoViews }

enum CampaignStatus { demo, active, completed }

class CampaignDraft extends Equatable {
  const CampaignDraft({
    this.postId,
    this.goal,
    this.interests = const {},
    this.locations = const {},
    this.dailyBudgetRupees = 200,
    this.days = 7,
  });

  final String? postId;
  final AdGoal? goal;

  /// Privacy-preserving interest cohorts only — never personal attributes.
  final Set<String> interests;
  final Set<String> locations;
  final int dailyBudgetRupees;
  final int days;

  int get totalBudgetRupees => dailyBudgetRupees * days;

  CampaignDraft copyWith({
    String? postId,
    AdGoal? goal,
    Set<String>? interests,
    Set<String>? locations,
    int? dailyBudgetRupees,
    int? days,
  }) => CampaignDraft(
    postId: postId ?? this.postId,
    goal: goal ?? this.goal,
    interests: interests ?? this.interests,
    locations: locations ?? this.locations,
    dailyBudgetRupees: dailyBudgetRupees ?? this.dailyBudgetRupees,
    days: days ?? this.days,
  );

  @override
  List<Object?> get props => [
    postId,
    goal,
    interests,
    locations,
    dailyBudgetRupees,
    days,
  ];
}

class Campaign extends Equatable {
  const Campaign({
    required this.id,
    required this.draft,
    required this.status,
    required this.estimatedReachMin,
    required this.estimatedReachMax,
    required this.createdAt,
  });

  final String id;
  final CampaignDraft draft;
  final CampaignStatus status;
  final int estimatedReachMin;
  final int estimatedReachMax;
  final DateTime createdAt;

  @override
  List<Object?> get props => [
    id,
    draft,
    status,
    estimatedReachMin,
    estimatedReachMax,
    createdAt,
  ];
}

// ----------------------------------------------------- Verification / trust --

enum VerificationState { notRequested, pending, verified, rejected }

class VerificationStatus extends Equatable {
  const VerificationStatus({required this.state, this.type, this.submittedAt});

  const VerificationStatus.none()
    : state = VerificationState.notRequested,
      type = null,
      submittedAt = null;

  final VerificationState state;
  final VerificationType? type;
  final DateTime? submittedAt;

  @override
  List<Object?> get props => [state, type, submittedAt];
}

enum ReportReason {
  spam,
  harassment,
  nudity,
  violence,
  selfHarm,
  misinformation,
  scam,
  other,
}

enum ReportTargetType { post, reel, comment, user }

class ReportRequest extends Equatable {
  const ReportRequest({
    required this.targetType,
    required this.targetId,
    required this.reason,
    this.details,
  });

  final ReportTargetType targetType;
  final String targetId;
  final ReportReason reason;
  final String? details;

  @override
  List<Object?> get props => [targetType, targetId, reason, details];
}
