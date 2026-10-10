/// Field-level reasons a profile edit can be refused.
enum ProfileField { name, username, bio, website, dateOfBirth }

enum ProfileError {
  required,
  nameTooShort,
  nameTooLong,
  usernameTooShort,
  usernameTooLong,
  usernameChars,
  usernameReserved,
  usernameTaken,
  bioTooLong,
  websiteInvalid,
  dobFuture,
  dobUnderAge,
  dobInvalid,
}

/// Limits shared by the form (fast feedback) and the mock server (which
/// re-checks everything, as the real backend must).
abstract final class ProfileRules {
  static const nameMin = 2;
  static const nameMax = 50;
  static const usernameMin = 3;
  static const usernameMax = 30;
  static const bioMax = 150;
  static const websiteMax = 100;

  /// Minimum age to hold an account.
  static const minAge = 13;
  static const maxAge = 120;

  /// Names that would let someone impersonate the platform.
  static const reservedUsernames = {
    'admin',
    'administrator',
    'api',
    'blocks',
    'blocksapp',
    'help',
    'me',
    'moderator',
    'null',
    'official',
    'root',
    'security',
    'staff',
    'support',
    'team',
    'undefined',
  };
}

/// "@Aarav.Blocks " -> "aarav.blocks".
String normalizeUsername(String raw) =>
    raw.trim().toLowerCase().replaceFirst(RegExp(r'^@+'), '');

/// Whole years between [dob] and [now].
int ageOn(DateTime dob, DateTime now) {
  var age = now.year - dob.year;
  final hadBirthday =
      now.month > dob.month || (now.month == dob.month && now.day >= dob.day);
  if (!hadBirthday) age--;
  return age;
}

/// Normalises a website for storage: trims, adds `https://` when missing,
/// lower-cases the host. Returns null for an empty value and throws a
/// [FormatException] for anything that is not a plain http(s) web address.
String? normalizeWebsite(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return null;
  if (v.length > ProfileRules.websiteMax) {
    throw const FormatException('website too long');
  }
  final withScheme = RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*://').hasMatch(v)
      ? v
      : 'https://$v';
  final uri = Uri.parse(withScheme);
  final okScheme = uri.scheme == 'http' || uri.scheme == 'https';
  final host = uri.host;
  // A real host: dotted, characters limited to a-z 0-9 and "-", and every
  // label non-empty (no "a..b", ".com", "a.") and not starting/ending in "-".
  final labels = host.toLowerCase().split('.');
  final okHost =
      labels.length >= 2 &&
      labels.every(
        (l) =>
            l.isNotEmpty &&
            l.length <= 63 &&
            RegExp(r'^[a-z0-9-]+$').hasMatch(l) &&
            !l.startsWith('-') &&
            !l.endsWith('-'),
      );
  if (!okScheme || !okHost || uri.userInfo.isNotEmpty) {
    throw const FormatException('not a web address');
  }
  return uri.replace(host: host.toLowerCase()).toString();
}

abstract final class ProfileValidator {
  /// Returns every problem found (empty map = valid). Username *availability*
  /// is a server question and is not decided here.
  static Map<ProfileField, ProfileError> validate({
    required String name,
    required String username,
    required String bio,
    required String website,
    required DateTime? dateOfBirth,
    required DateTime now,
  }) {
    final errors = <ProfileField, ProfileError>{};

    final n = name.trim();
    if (n.isEmpty) {
      errors[ProfileField.name] = ProfileError.required;
    } else if (n.length < ProfileRules.nameMin) {
      errors[ProfileField.name] = ProfileError.nameTooShort;
    } else if (n.length > ProfileRules.nameMax) {
      errors[ProfileField.name] = ProfileError.nameTooLong;
    }

    final u = normalizeUsername(username);
    if (u.isEmpty) {
      errors[ProfileField.username] = ProfileError.required;
    } else if (u.length < ProfileRules.usernameMin) {
      errors[ProfileField.username] = ProfileError.usernameTooShort;
    } else if (u.length > ProfileRules.usernameMax) {
      errors[ProfileField.username] = ProfileError.usernameTooLong;
    } else if (!RegExp(r'^[a-z0-9._]+$').hasMatch(u) ||
        u.startsWith('.') ||
        u.endsWith('.') ||
        u.contains('..')) {
      errors[ProfileField.username] = ProfileError.usernameChars;
    } else if (ProfileRules.reservedUsernames.contains(u)) {
      errors[ProfileField.username] = ProfileError.usernameReserved;
    }

    if (bio.trim().length > ProfileRules.bioMax) {
      errors[ProfileField.bio] = ProfileError.bioTooLong;
    }

    try {
      normalizeWebsite(website);
    } on FormatException {
      errors[ProfileField.website] = ProfileError.websiteInvalid;
    }

    if (dateOfBirth != null) {
      if (dateOfBirth.isAfter(now)) {
        errors[ProfileField.dateOfBirth] = ProfileError.dobFuture;
      } else {
        final age = ageOn(dateOfBirth, now);
        if (age < ProfileRules.minAge) {
          errors[ProfileField.dateOfBirth] = ProfileError.dobUnderAge;
        } else if (age > ProfileRules.maxAge) {
          errors[ProfileField.dateOfBirth] = ProfileError.dobInvalid;
        }
      }
    }
    return errors;
  }
}
