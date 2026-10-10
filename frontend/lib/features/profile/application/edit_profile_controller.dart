import 'dart:async';

import 'package:blocks_app/core/constants/districts.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:blocks_app/features/profile/domain/profile_validator.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Countries offered in the picker (the platform is India-first; outside India
/// state and district are free text because the district list is India-only).
const kCountries = <String>[
  'India',
  'Nepal',
  'Bangladesh',
  'Sri Lanka',
  'United Arab Emirates',
  'Singapore',
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
];

const kHome = 'India';

/// Indian states that have at least one district in the catalogue.
List<String> indianStates() =>
    ({for (final d in kDistricts) d.state}.toList()..sort());

List<String> districtsOf(String state) => [
  for (final d in kDistricts)
    if (d.state == state) d.name,
];

enum UsernameStatus { unchanged, invalid, checking, available, taken }

/// What the form is editing. Plain values only, so it is cheap to compare
/// ("has anything changed?") and to send.
class ProfileDraft extends Equatable {
  const ProfileDraft({
    required this.name,
    required this.username,
    required this.bio,
    required this.website,
    required this.country,
    required this.state,
    required this.district,
    this.dateOfBirth,
    this.gender,
  });

  factory ProfileDraft.from(AppUser user, PrivateProfile private) =>
      ProfileDraft(
        name: user.name,
        username: normalizeUsername(user.username),
        bio: user.bio,
        website: user.website ?? '',
        country: user.country,
        state: user.state,
        district: user.district,
        dateOfBirth: private.dateOfBirth,
        gender: private.gender,
      );

  final String name;

  /// Without the leading "@".
  final String username;
  final String bio;
  final String website;
  final String country;
  final String state;
  final String district;
  final DateTime? dateOfBirth;
  final Gender? gender;

  ProfileDraft copyWith({
    String? name,
    String? username,
    String? bio,
    String? website,
    String? country,
    String? state,
    String? district,
    DateTime? dateOfBirth,
    bool clearDateOfBirth = false,
    Gender? gender,
    bool clearGender = false,
  }) => ProfileDraft(
    name: name ?? this.name,
    username: username ?? this.username,
    bio: bio ?? this.bio,
    website: website ?? this.website,
    country: country ?? this.country,
    state: state ?? this.state,
    district: district ?? this.district,
    dateOfBirth: clearDateOfBirth ? null : (dateOfBirth ?? this.dateOfBirth),
    gender: clearGender ? null : (gender ?? this.gender),
  );

  ProfileUpdate toUpdate() => ProfileUpdate(
    name: name.trim(),
    username: normalizeUsername(username),
    bio: bio.trim(),
    website: website.trim().isEmpty ? null : website.trim(),
    country: country,
    state: state,
    district: district,
    dateOfBirth: dateOfBirth,
    gender: gender,
  );

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

class EditProfileState extends Equatable {
  const EditProfileState({
    required this.draft,
    required this.original,
    this.errors = const {},
    this.usernameStatus = UsernameStatus.unchanged,
    this.saving = false,
    this.saved = false,
    this.saveFailed = false,
  });

  final ProfileDraft draft;
  final ProfileDraft original;
  final Map<ProfileField, ProfileError> errors;
  final UsernameStatus usernameStatus;
  final bool saving;
  final bool saved;
  final bool saveFailed;

  bool get isDirty => draft != original;

  /// Fine to attempt a save: something changed and nothing is known to be wrong.
  bool get canSave =>
      isDirty &&
      !saving &&
      errors.isEmpty &&
      usernameStatus != UsernameStatus.taken &&
      usernameStatus != UsernameStatus.invalid;

  EditProfileState copyWith({
    ProfileDraft? draft,
    Map<ProfileField, ProfileError>? errors,
    UsernameStatus? usernameStatus,
    bool? saving,
    bool? saved,
    bool? saveFailed,
  }) => EditProfileState(
    draft: draft ?? this.draft,
    original: original,
    errors: errors ?? this.errors,
    usernameStatus: usernameStatus ?? this.usernameStatus,
    saving: saving ?? this.saving,
    saved: saved ?? this.saved,
    saveFailed: saveFailed ?? this.saveFailed,
  );

  @override
  List<Object?> get props => [
    draft,
    original,
    errors,
    usernameStatus,
    saving,
    saved,
    saveFailed,
  ];
}

/// Edit Profile. Fields are checked as you type for instant feedback; the
/// server checks them all again on save (and is the only judge of whether a
/// username is really free).
class EditProfileController extends AsyncNotifier<EditProfileState> {
  Timer? _usernameTimer;
  static const _usernameDebounce = Duration(milliseconds: 400);

  @override
  Future<EditProfileState> build() async {
    ref.onDispose(() => _usernameTimer?.cancel());
    // `read`, not `watch`: saving refreshes the user, which must not reset
    // the form underneath the person who just saved it.
    final user = await ref.read(currentUserProvider.future);
    final private = await ref
        .read(profileRepositoryProvider)
        .getPrivateProfile();
    final draft = ProfileDraft.from(user, private);
    return EditProfileState(draft: draft, original: draft);
  }

  DateTime get _now => ref.read(clockProvider)();

  Map<ProfileField, ProfileError> _validate(ProfileDraft d) =>
      ProfileValidator.validate(
        name: d.name,
        username: d.username,
        bio: d.bio,
        website: d.website,
        dateOfBirth: d.dateOfBirth,
        now: _now,
      );

  void _apply(ProfileDraft draft, {UsernameStatus? username}) {
    final current = state.value;
    if (current == null) return;
    var errors = _validate(draft);
    // A server verdict on the username sticks until the username changes.
    final status = username ?? current.usernameStatus;
    if (status == UsernameStatus.taken &&
        !errors.containsKey(ProfileField.username)) {
      errors = {...errors, ProfileField.username: ProfileError.usernameTaken};
    }
    state = AsyncData(
      current.copyWith(
        draft: draft,
        errors: errors,
        usernameStatus: status,
        saved: false,
        saveFailed: false,
      ),
    );
  }

  void setName(String v) => _apply(state.requireValue.draft.copyWith(name: v));
  void setBio(String v) => _apply(state.requireValue.draft.copyWith(bio: v));
  void setWebsite(String v) =>
      _apply(state.requireValue.draft.copyWith(website: v));

  void setUsername(String v) {
    final current = state.requireValue;
    final draft = current.draft.copyWith(username: v);
    final normalized = normalizeUsername(v);
    _usernameTimer?.cancel();

    if (normalized == normalizeUsername(current.original.username)) {
      _apply(draft, username: UsernameStatus.unchanged);
      return;
    }
    final formatError = _validate(draft)[ProfileField.username];
    if (formatError != null) {
      _apply(draft, username: UsernameStatus.invalid);
      return;
    }
    _apply(draft, username: UsernameStatus.checking);
    _usernameTimer = Timer(_usernameDebounce, () => _checkUsername(normalized));
  }

  Future<void> _checkUsername(String normalized) async {
    try {
      final free = await ref
          .read(profileRepositoryProvider)
          .isUsernameAvailable(normalized);
      final current = state.value;
      // Ignore a stale answer for a name the user has already moved on from.
      if (current == null ||
          normalizeUsername(current.draft.username) != normalized) {
        return;
      }
      _apply(
        current.draft,
        username: free ? UsernameStatus.available : UsernameStatus.taken,
      );
    } on Object {
      final current = state.value;
      if (current != null) {
        _apply(current.draft, username: UsernameStatus.unchanged);
      }
    }
  }

  void setCountry(String country) {
    final d = state.requireValue.draft;
    if (country == d.country) return;
    if (country == kHome) {
      // Back to the pick-lists: land on a valid state and district.
      final state0 = indianStates().contains(d.state)
          ? d.state
          : indianStates().first;
      final districts = districtsOf(state0);
      _apply(
        d.copyWith(
          country: country,
          state: state0,
          district: districts.contains(d.district)
              ? d.district
              : districts.first,
        ),
      );
    } else {
      _apply(d.copyWith(country: country));
    }
  }

  /// Sets the state / region (and, for India, resets the district list).
  void setRegion(String region) {
    final d = state.requireValue.draft;
    final districts = districtsOf(region);
    _apply(
      d.copyWith(
        state: region,
        district: districts.contains(d.district)
            ? d.district
            : (districts.isEmpty ? d.district : districts.first),
      ),
    );
  }

  void setDistrict(String v) =>
      _apply(state.requireValue.draft.copyWith(district: v));

  void setDateOfBirth(DateTime? v) => _apply(
    state.requireValue.draft.copyWith(
      dateOfBirth: v,
      clearDateOfBirth: v == null,
    ),
  );

  void setGender(Gender? v) => _apply(
    state.requireValue.draft.copyWith(gender: v, clearGender: v == null),
  );

  /// Returns true when the profile was saved.
  Future<bool> save() async {
    final current = state.value;
    if (current == null || current.saving) return false;
    final errors = _validate(current.draft);
    if (errors.isNotEmpty) {
      state = AsyncData(current.copyWith(errors: errors));
      return false;
    }
    state = AsyncData(current.copyWith(saving: true, saveFailed: false));
    try {
      await ref
          .read(profileRepositoryProvider)
          .updateProfile(current.draft.toUpdate());
      ref.invalidate(currentUserProvider);
      final done = state.requireValue;
      state = AsyncData(
        EditProfileState(draft: done.draft, original: done.draft, saved: true),
      );
      return true;
    } on FieldValidationFailure catch (f) {
      final server = <ProfileField, ProfileError>{};
      for (final e in f.errors.entries) {
        final field = ProfileField.values.asNameMap()[e.key];
        final error = ProfileError.values.asNameMap()[e.value];
        if (field != null && error != null) server[field] = error;
      }
      state = AsyncData(
        current.copyWith(
          saving: false,
          errors: server,
          usernameStatus:
              server[ProfileField.username] == ProfileError.usernameTaken
              ? UsernameStatus.taken
              : current.usernameStatus,
        ),
      );
    } on Object {
      state = AsyncData(current.copyWith(saving: false, saveFailed: true));
    }
    return false;
  }
}

final editProfileControllerProvider =
    AsyncNotifierProvider.autoDispose<EditProfileController, EditProfileState>(
      EditProfileController.new,
    );
