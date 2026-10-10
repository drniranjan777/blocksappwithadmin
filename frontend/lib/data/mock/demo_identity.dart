import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Lightweight identity of the demo creator, used before the full `User`
/// model arrives (Phase 2). Lives under `data/mock` so no widget ever
/// hard-codes demo values.
class DemoIdentity extends Equatable {
  const DemoIdentity({
    required this.name,
    required this.username,
    required this.district,
    required this.state,
    required this.reachLevel,
    required this.isVerified,
  });

  final String name;
  final String username;
  final String district;
  final String state;
  final ReachLevel reachLevel;
  final bool isVerified;

  String get location => '$district, $state';

  @override
  List<Object?> get props => [
    name,
    username,
    district,
    state,
    reachLevel,
    isVerified,
  ];
}

const _aarav = DemoIdentity(
  name: 'Aarav Kumar',
  username: '@aarav.blocks',
  district: 'Hyderabad',
  state: 'Telangana',
  reachLevel: ReachLevel.state,
  isVerified: true,
);

final demoIdentityProvider = Provider<DemoIdentity>((ref) => _aarav);
