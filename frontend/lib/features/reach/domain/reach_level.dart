/// The BLOCKS Reach Ladder: District -> State -> National -> Global.
enum ReachLevel {
  district('D1'),
  state('S1'),
  national('N1'),
  global('G1');

  const ReachLevel(this.code);

  /// Short code shown in badges, e.g. "S1".
  final String code;

  /// The level a post can climb to next, or null at the top of the ladder.
  ReachLevel? get next => this == global ? null : ReachLevel.values[index + 1];

  bool get isTop => this == global;

  bool isAtLeast(ReachLevel other) => index >= other.index;
}
