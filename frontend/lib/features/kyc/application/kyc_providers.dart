import 'package:blocks_app/data/models/kyc_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The creator's verification, exactly as the server reports it.
final kycApplicationProvider = FutureProvider.autoDispose<KycApplication>(
  (ref) => ref.watch(kycRepositoryProvider).getApplication(),
);

/// Which documents the server accepts (configuration, not code).
final kycConfigProvider = FutureProvider<KycConfig>(
  (ref) => ref.watch(creatorConfigRepositoryProvider).getKycConfig(),
);
