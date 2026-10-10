import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class VerificationController extends AsyncNotifier<VerificationStatus> {
  @override
  Future<VerificationStatus> build() =>
      ref.read(verificationRepositoryProvider).getStatus();

  Future<void> request(VerificationType type) async {
    final status = await ref.read(verificationRepositoryProvider).submit(type);
    state = AsyncData(status);
  }

  /// Demo-only admin approval of the pending request.
  Future<void> approveForDemo() async {
    final status = await ref
        .read(verificationRepositoryProvider)
        .approveForDemo();
    state = AsyncData(status);
    ref.invalidate(currentUserProvider);
  }
}

final verificationControllerProvider =
    AsyncNotifierProvider<VerificationController, VerificationStatus>(
      VerificationController.new,
    );
