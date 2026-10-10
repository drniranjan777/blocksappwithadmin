import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/core/pagination/paged_notifier.dart';
import 'package:blocks_app/data/models/business_models.dart';
import 'package:blocks_app/data/models/paged_result.dart';
import 'package:blocks_app/data/models/post.dart';
import 'package:blocks_app/data/providers.dart';
import 'package:blocks_app/features/business/domain/campaign_rules.dart';
import 'package:blocks_app/features/profile/application/user_providers.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final businessProvider = FutureProvider.family<BusinessProfile, String>(
  (ref, id) => ref.watch(businessRepositoryProvider).getBusiness(id),
);

final businessOffersProvider = FutureProvider.family<List<Offer>, String>(
  (ref, id) => ref.watch(businessRepositoryProvider).getOffers(id),
);

class BusinessPostsController extends PagedNotifier<Post> {
  BusinessPostsController(this.businessId);

  final String businessId;

  @override
  Future<PagedResult<Post>> fetchPage(String? cursor) => ref
      .read(businessRepositoryProvider)
      .getBusinessPosts(businessId, cursor: cursor, limit: 18);
}

final businessPostsProvider =
    AsyncNotifierProvider.family<
      BusinessPostsController,
      PagedState<Post>,
      String
    >(BusinessPostsController.new);

/// Posts the user can promote: their business posts first, then their own.
final promotablePostsProvider = FutureProvider<List<Post>>((ref) async {
  final me = await ref.watch(currentUserProvider.future);
  final own = await ref
      .watch(postRepositoryProvider)
      .getUserPosts(me.id, limit: 6);
  final biz = me.businessId == null
      ? const PagedResult<Post>.empty()
      : await ref
            .watch(businessRepositoryProvider)
            .getBusinessPosts(me.businessId!, limit: 6);
  return [...biz.items, ...own.items];
});

// ---------------------------------------------------------------- Promote --

enum PromoteStep { post, goal, audience, location, budget, review, publish }

class PromoteState extends Equatable {
  const PromoteState({
    this.step = PromoteStep.post,
    this.draft = const CampaignDraft(dailyBudgetRupees: 500),
    this.isSubmitting = false,
    this.campaign,
    this.showErrors = false,
  });

  final PromoteStep step;
  final CampaignDraft draft;
  final bool isSubmitting;
  final Campaign? campaign;
  final bool showErrors;

  /// Whether the current step's input is complete enough to continue.
  bool get canContinue => switch (step) {
    PromoteStep.post => draft.postId != null,
    PromoteStep.goal => draft.goal != null,
    PromoteStep.audience => true, // interests are optional
    PromoteStep.location => draft.locations.isNotEmpty,
    PromoteStep.budget =>
      draft.dailyBudgetRupees >= CampaignRules.minDailyBudget &&
          draft.dailyBudgetRupees <= CampaignRules.maxDailyBudget &&
          draft.days >= 1 &&
          draft.days <= CampaignRules.maxDays,
    PromoteStep.review => CampaignRules.validate(draft).isEmpty,
    PromoteStep.publish => true,
  };

  PromoteState copyWith({
    PromoteStep? step,
    CampaignDraft? draft,
    bool? isSubmitting,
    Campaign? campaign,
    bool? showErrors,
  }) {
    return PromoteState(
      step: step ?? this.step,
      draft: draft ?? this.draft,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      campaign: campaign ?? this.campaign,
      showErrors: showErrors ?? this.showErrors,
    );
  }

  @override
  List<Object?> get props => [step, draft, isSubmitting, campaign, showErrors];
}

class PromoteController extends Notifier<PromoteState> {
  @override
  PromoteState build() {
    final me = ref.read(currentUserProvider).value;
    return PromoteState(
      draft: CampaignDraft(
        dailyBudgetRupees: 500,
        locations: me == null ? const {} : {me.district},
      ),
    );
  }

  void _draft(CampaignDraft d) => state = state.copyWith(draft: d);

  /// Pre-selects a post when the flow is opened from a post's menu.
  void preselect(String? postId) {
    if (postId == null || state.draft.postId != null) return;
    _draft(state.draft.copyWith(postId: postId));
  }

  void setPost(String id) => _draft(state.draft.copyWith(postId: id));
  void setGoal(AdGoal g) => _draft(state.draft.copyWith(goal: g));

  void toggleInterest(String interest) {
    final next = {...state.draft.interests};
    next.contains(interest) ? next.remove(interest) : next.add(interest);
    _draft(state.draft.copyWith(interests: next));
  }

  void toggleLocation(String district) {
    final next = {...state.draft.locations};
    next.contains(district) ? next.remove(district) : next.add(district);
    _draft(state.draft.copyWith(locations: next));
  }

  void setDailyBudget(int rupees) =>
      _draft(state.draft.copyWith(dailyBudgetRupees: rupees));
  void setDays(int days) => _draft(state.draft.copyWith(days: days));

  void next() {
    if (!state.canContinue) {
      state = state.copyWith(showErrors: true);
      return;
    }
    final i = state.step.index;
    if (i < PromoteStep.review.index) {
      state = state.copyWith(
        step: PromoteStep.values[i + 1],
        showErrors: false,
      );
    }
  }

  void back() {
    final i = state.step.index;
    if (i > 0 && state.step != PromoteStep.publish) {
      state = state.copyWith(
        step: PromoteStep.values[i - 1],
        showErrors: false,
      );
    }
  }

  /// Creates the demo campaign and moves to the final step.
  Future<void> publish() async {
    if (CampaignRules.validate(state.draft).isNotEmpty) {
      state = state.copyWith(showErrors: true);
      return;
    }
    state = state.copyWith(isSubmitting: true);
    try {
      final campaign = await ref
          .read(adRepositoryProvider)
          .createCampaign(state.draft);
      state = state.copyWith(
        isSubmitting: false,
        campaign: campaign,
        step: PromoteStep.publish,
      );
    } on AppFailure {
      state = state.copyWith(isSubmitting: false);
    }
  }
}

final promoteControllerProvider =
    NotifierProvider.autoDispose<PromoteController, PromoteState>(
      PromoteController.new,
    );
