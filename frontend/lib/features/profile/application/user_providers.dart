import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/profile_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The signed-in user. Invalidate after anything that changes their profile
/// (follow counts, verification, 2FA, new post).
final currentUserProvider = FutureProvider<AppUser>(
  (ref) => ref.watch(userRepositoryProvider).getCurrentUser(),
);

final userProvider = FutureProvider.family<AppUser, String>(
  (ref, id) => ref.watch(userRepositoryProvider).getUser(id),
);

/// What the form may offer for editing (the live service fixes the username and
/// the date of birth at sign-up).
final profileCapabilitiesProvider = Provider<ProfileCapabilities>(
  (ref) => ref.watch(profileRepositoryProvider).capabilities,
);
