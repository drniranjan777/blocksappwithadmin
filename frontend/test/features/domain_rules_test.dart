import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/features/business/domain/campaign_rules.dart';
import 'package:blocks_app/features/create/domain/live_eligibility.dart';
import 'package:blocks_app/features/create/domain/post_draft_validator.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';
import 'package:flutter_test/flutter_test.dart';

AppUser _user({
  int followers = 18450,
  int ageDays = 412,
  bool twoFactor = true,
  TrustStatus trust = TrustStatus.eligible,
  bool violation = false,
  bool ageOk = true,
}) => AppUser(
  id: 'x',
  name: 'X',
  username: '@x',
  bio: '',
  district: 'Hyderabad',
  state: 'Telangana',
  followersCount: followers,
  followingCount: 0,
  postsCount: 0,
  reachLevel: ReachLevel.district,
  accountAgeDays: ageDays,
  isTwoFactorEnabled: twoFactor,
  trustStatus: trust,
  hasMajorViolation: violation,
  isAgeEligible: ageOk,
);

void main() {
  group('live eligibility', () {
    const evaluator = LiveEligibilityEvaluator();

    test('demo creator is eligible', () {
      expect(evaluator.canGoLive(_user()), isTrue);
    });

    test('boundaries: exactly 5,000 followers and 30 days pass', () {
      expect(evaluator.canGoLive(_user(followers: 5000, ageDays: 30)), isTrue);
      expect(evaluator.canGoLive(_user(followers: 4999)), isFalse);
      expect(evaluator.canGoLive(_user(ageDays: 29)), isFalse);
    });

    test('each non-numeric rule blocks access on its own', () {
      expect(evaluator.canGoLive(_user(twoFactor: false)), isFalse);
      expect(
        evaluator.canGoLive(_user(trust: TrustStatus.underReview)),
        isFalse,
      );
      expect(evaluator.canGoLive(_user(violation: true)), isFalse);
      expect(evaluator.canGoLive(_user(ageOk: false)), isFalse);
    });

    test('result lists which rules failed', () {
      final r = evaluator.evaluate(_user(twoFactor: false, followers: 100));
      final failed = r.checks
          .where((c) => !c.passed)
          .map((c) => c.rule)
          .toSet();
      expect(failed, {LiveRule.followers, LiveRule.twoFactor});
    });

    test('every threshold is configurable', () {
      const relaxed = LiveEligibilityEvaluator(
        LiveEligibilityConfig(
          minFollowers: 100,
          minAccountAgeDays: 1,
          requireTwoFactor: false,
          requireTrustEligible: false,
          forbidMajorViolation: false,
          requireAgeEligible: false,
        ),
      );
      expect(
        relaxed.canGoLive(
          _user(followers: 100, ageDays: 1, twoFactor: false, violation: true),
        ),
        isTrue,
      );
    });
  });

  group('post draft validation', () {
    PostDraft draft({
      PostType type = PostType.image,
      String caption = 'hi',
      String? media = 'demo://art/1',
      String district = 'Hyderabad',
    }) => PostDraft(
      type: type,
      caption: caption,
      mediaUrl: media,
      district: district,
      state: 'Telangana',
    );

    test('valid drafts pass', () {
      expect(PostDraftValidator.validate(draft()), isEmpty);
      expect(
        PostDraftValidator.validate(draft(type: PostType.text, media: null)),
        isEmpty,
      );
    });

    test('reports every problem', () {
      final errors = PostDraftValidator.validate(
        draft(
          type: PostType.video,
          media: null,
          caption: 'a' * 2300,
          district: '',
        ),
      );
      expect(
        errors,
        containsAll([
          PostDraftError.mediaRequired,
          PostDraftError.captionTooLong,
          PostDraftError.locationRequired,
        ]),
      );
    });

    test('hashtag extraction de-duplicates case-insensitively and supports Indic scripts', () {
      expect(extractHashtags('#Food #food hello #Hyd_2 #हैदराबाद'), [
        '#Food',
        '#Hyd_2',
        '#हैदराबाद',
      ]);
    });

    test('more than 30 hashtags is rejected', () {
      final caption = List.generate(31, (i) => '#t$i').join(' ');
      expect(
        PostDraftValidator.validate(draft(caption: caption)),
        contains(PostDraftError.tooManyHashtags),
      );
    });
  });

  group('campaign rules', () {
    const ok = CampaignDraft(
      postId: 'p',
      goal: AdGoal.followers,
      locations: {'Hyderabad'},
      dailyBudgetRupees: 300,
      days: 7,
    );

    test('valid draft passes and totals the budget', () {
      expect(CampaignRules.validate(ok), isEmpty);
      expect(ok.totalBudgetRupees, 2100);
    });

    test('flags budget and duration limits', () {
      expect(
        CampaignRules.validate(ok.copyWith(dailyBudgetRupees: 50)),
        contains(CampaignError.budgetTooLow),
      );
      expect(
        CampaignRules.validate(ok.copyWith(dailyBudgetRupees: 60000)),
        contains(CampaignError.budgetTooHigh),
      );
      expect(
        CampaignRules.validate(ok.copyWith(days: 31)),
        contains(CampaignError.durationInvalid),
      );
    });

    test('more budget and more locations estimate more reach', () {
      final (lo1, hi1) = CampaignRules.estimateReach(ok);
      final (lo2, _) = CampaignRules.estimateReach(
        ok.copyWith(dailyBudgetRupees: 900),
      );
      final (lo3, _) = CampaignRules.estimateReach(
        ok.copyWith(locations: {'Hyderabad', 'Warangal'}),
      );
      expect(hi1, greaterThan(lo1));
      expect(lo2, greaterThan(lo1));
      expect(lo3, greaterThan(lo1));
    });
  });
}
