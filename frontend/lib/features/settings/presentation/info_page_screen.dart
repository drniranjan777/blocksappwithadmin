import 'package:blocks_app/app/theme/blocks_tokens.dart';
import 'package:blocks_app/core/extensions/build_context_x.dart';
import 'package:blocks_app/core/widgets/responsive_center.dart';
import 'package:blocks_app/core/widgets/state_views.dart';
import 'package:flutter/material.dart';

/// One heading plus its body text.
class InfoSection {
  const InfoSection({required this.body, this.heading});

  final String? heading;
  final String body;
}

/// Parses ARB-friendly page copy: sections are separated by a blank line, and
/// a section whose first line starts with "# " has that line as its heading,
/// e.g. "# Be real\nShare your own work.".
List<InfoSection> parseInfoSections(String raw) {
  final sections = <InfoSection>[];
  for (final block in raw.split('\n\n')) {
    final text = block.trim();
    if (text.isEmpty) continue;
    final lines = text.split('\n');
    if (lines.first.startsWith('# ')) {
      sections.add(
        InfoSection(
          heading: lines.first.substring(2).trim(),
          body: lines.skip(1).join('\n').trim(),
        ),
      );
    } else {
      sections.add(InfoSection(body: text));
    }
  }
  return sections;
}

/// Static policy / help pages. Content lives in the ARB files.
class InfoPageScreen extends StatelessWidget {
  const InfoPageScreen({required this.topic, super.key});

  final String topic;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final content = switch (topic) {
      'guidelines' => (l10n.infoGuidelinesTitle, l10n.infoGuidelinesBody),
      'privacy' => (l10n.infoPrivacyTitle, l10n.infoPrivacyBody),
      'terms' => (l10n.infoTermsTitle, l10n.infoTermsBody),
      'help' => (l10n.infoHelpTitle, l10n.infoHelpBody),
      _ => null,
    };

    if (content == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const SafeArea(child: EmptyView()),
      );
    }
    final (title, raw) = content;

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ResponsiveCenter(
          child: ListView(
            padding: const EdgeInsets.all(BlocksSpacing.lg),
            children: [
              for (final s in parseInfoSections(raw))
                Padding(
                  padding: const EdgeInsets.only(bottom: BlocksSpacing.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (s.heading != null)
                        Padding(
                          padding: const EdgeInsets.only(
                            bottom: BlocksSpacing.xs,
                          ),
                          child: Semantics(
                            header: true,
                            child: Text(
                              s.heading!,
                              style: context.text.titleMedium,
                            ),
                          ),
                        ),
                      Text(
                        s.body,
                        style: context.text.bodyMedium?.copyWith(height: 1.5),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: BlocksSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}
