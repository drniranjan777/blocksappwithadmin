import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:flutter/material.dart';

/// Keeps single-column content readable on tablets/foldables by capping its
/// width and centring it; on phones it is a no-op.
class ResponsiveCenter extends StatelessWidget {
  const ResponsiveCenter({
    required this.child,
    super.key,
    this.maxWidth = BlocksBreakpoints.contentMaxWidth,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
