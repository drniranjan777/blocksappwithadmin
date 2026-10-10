-- ---------------------------------------------------------------------------
-- Integrity rules that Prisma cannot express.
--
-- The point of putting these in the database is that they hold no matter which
-- code path (or which person with a SQL prompt) touches the data. Application
-- validation gives friendly errors; these are the last line of defence.
-- ---------------------------------------------------------------------------

-- ===== CHECK constraints ====================================================

-- Accounts
-- Every live account can be reached; an erased one (status DELETED) has had its
-- contact details removed on purpose and is kept only as an anchor for records.
ALTER TABLE users
  ADD CONSTRAINT users_contact_present CHECK (status = 'DELETED' OR email IS NOT NULL OR phone IS NOT NULL),
  ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._]{3,30}$'),
  ADD CONSTRAINT users_email_lowercase CHECK (email IS NULL OR email = lower(email)),
  ADD CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT users_failed_logins_nonnegative CHECK (failed_login_count >= 0);

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT admin_users_failed_logins_nonnegative CHECK (failed_login_count >= 0);

ALTER TABLE profiles
  ADD CONSTRAINT profiles_counters_nonnegative
  CHECK (followers_count >= 0 AND following_count >= 0 AND posts_count >= 0);

ALTER TABLE follows ADD CONSTRAINT follows_not_self CHECK (follower_id <> followee_id);
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id);

-- Content: each engagement row points at exactly one target.
ALTER TABLE likes ADD CONSTRAINT likes_one_target
  CHECK (num_nonnulls(post_id, reel_id, comment_id) = 1);
ALTER TABLE shares ADD CONSTRAINT shares_one_target
  CHECK (num_nonnulls(post_id, reel_id) = 1);
ALTER TABLE saves ADD CONSTRAINT saves_one_target
  CHECK (num_nonnulls(post_id, reel_id) = 1);
ALTER TABLE comments ADD CONSTRAINT comments_one_target
  CHECK (num_nonnulls(post_id, reel_id) = 1);
ALTER TABLE reach_events ADD CONSTRAINT reach_events_one_target
  CHECK (num_nonnulls(post_id, reel_id) = 1);
ALTER TABLE reach_scores ADD CONSTRAINT reach_scores_one_target
  CHECK (num_nonnulls(post_id, reel_id) = 1);

ALTER TABLE posts ADD CONSTRAINT posts_counters_nonnegative
  CHECK (likes_count >= 0 AND comments_count >= 0 AND shares_count >= 0
         AND saves_count >= 0 AND views_count >= 0 AND qualified_reach >= 0);
ALTER TABLE reels ADD CONSTRAINT reels_counters_nonnegative
  CHECK (likes_count >= 0 AND comments_count >= 0 AND shares_count >= 0
         AND saves_count >= 0 AND views_count >= 0 AND qualified_reach >= 0);
ALTER TABLE comments ADD CONSTRAINT comments_counters_nonnegative
  CHECK (likes_count >= 0 AND replies_count >= 0);

ALTER TABLE reels
  ADD CONSTRAINT reels_duration_positive CHECK (duration_ms > 0),
  ADD CONSTRAINT reels_music_window
    CHECK (music_start_ms IS NULL OR music_end_ms IS NULL OR music_end_ms > music_start_ms),
  ADD CONSTRAINT reels_published_has_time
    CHECK (publish_status <> 'PUBLISHED' OR published_at IS NOT NULL);
ALTER TABLE reel_clips
  ADD CONSTRAINT reel_clips_window CHECK (end_ms > start_ms AND start_ms >= 0),
  ADD CONSTRAINT reel_clips_volume CHECK (volume >= 0 AND volume <= 1);
ALTER TABLE stories ADD CONSTRAINT stories_expiry_after_creation CHECK (expires_at > created_at);

-- Media
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_sizes_valid
  CHECK (declared_size_bytes > 0 AND (size_bytes IS NULL OR size_bytes > 0)),
  ADD CONSTRAINT media_assets_dimensions_valid
  CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)
         AND (duration_ms IS NULL OR duration_ms >= 0));
ALTER TABLE upload_sessions
  ADD CONSTRAINT upload_sessions_progress_valid
  CHECK (uploaded_bytes >= 0 AND uploaded_bytes <= total_bytes AND total_bytes > 0
         AND part_size_bytes > 0);

-- Music: an active track must say where it may be played.
ALTER TABLE music_tracks
  ADD CONSTRAINT music_tracks_duration_positive CHECK (duration_ms > 0),
  ADD CONSTRAINT music_tracks_active_has_territory
    CHECK (status <> 'ACTIVE' OR cardinality(allowed_countries) > 0),
  ADD CONSTRAINT music_tracks_restricted_never_active
    CHECK (rights_type <> 'RESTRICTED' OR status <> 'ACTIVE');
ALTER TABLE music_licences
  ADD CONSTRAINT music_licences_window CHECK (expires_at IS NULL OR expires_at > starts_at);

-- Reach
ALTER TABLE reach_scores
  ADD CONSTRAINT reach_scores_score_range CHECK (score >= 0 AND score <= 100),
  ADD CONSTRAINT reach_scores_counts_nonnegative
    CHECK (qualified_reach >= 0 AND distinct_districts >= 0 AND distinct_states >= 0
           AND distinct_countries >= 0 AND excluded_events >= 0);
ALTER TABLE reach_events
  ADD CONSTRAINT reach_events_fraud_range CHECK (fraud_score >= 0 AND fraud_score <= 100);

-- Money: nothing negative, nothing zero where a movement is meant.
ALTER TABLE financial_ledger_entries
  ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0);
ALTER TABLE ledger_accounts
  ADD CONSTRAINT ledger_accounts_payable_not_overdrawn
    CHECK (type <> 'CREATOR_PAYABLE' OR balance >= 0),
  ADD CONSTRAINT ledger_accounts_creator_has_owner
    CHECK (type <> 'CREATOR_PAYABLE' OR owner_user_id IS NOT NULL);
ALTER TABLE payout_requests
  ADD CONSTRAINT payout_requests_amount_positive CHECK (amount > 0);
ALTER TABLE creator_earnings
  ADD CONSTRAINT creator_earnings_amounts_valid
  CHECK (estimated_amount >= 0 AND (finalized_amount IS NULL OR finalized_amount >= 0)
         AND qualified_reach >= 0),
  ADD CONSTRAINT creator_earnings_finalised_has_journal
  CHECK (status <> 'FINALIZED' OR (finalized_amount IS NOT NULL AND journal_id IS NOT NULL));
ALTER TABLE reward_cycles
  ADD CONSTRAINT reward_cycles_window CHECK (ends_at > starts_at),
  ADD CONSTRAINT reward_cycles_pool_nonnegative CHECK (pool_amount >= 0);

-- Bank, identity and tax identifiers: shape only, never the full value.
ALTER TABLE payout_accounts
  ADD CONSTRAINT payout_accounts_ifsc_format CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  ADD CONSTRAINT payout_accounts_last4_format CHECK (account_number_last4 ~ '^[0-9]{4}$'),
  ADD CONSTRAINT payout_accounts_primary_is_verified
    CHECK (NOT is_primary OR status = 'VERIFIED');
ALTER TABLE kyc_profiles
  ADD CONSTRAINT kyc_profiles_pan_last4_format CHECK (pan_last4 IS NULL OR pan_last4 ~ '^[A-Z0-9]{4}$');
ALTER TABLE tax_profiles
  ADD CONSTRAINT tax_profiles_pan_last4_format CHECK (pan_last4 IS NULL OR pan_last4 ~ '^[A-Z0-9]{4}$');

-- Aadhaar numbers are never stored: not as ciphertext and not as a blind index.
-- Only the last four digits and the provider's reference may be kept.
ALTER TABLE kyc_documents
  ADD CONSTRAINT kyc_documents_aadhaar_never_stored
  CHECK (type <> 'AADHAAR' OR (number_enc IS NULL AND number_index IS NULL)),
  ADD CONSTRAINT kyc_documents_last4_format
  CHECK (number_last4 IS NULL OR number_last4 ~ '^[A-Z0-9]{4}$');

-- Business and advertising
ALTER TABLE business_pages ADD CONSTRAINT business_pages_slug_format CHECK (slug ~ '^[a-z0-9-]{3,40}$');
ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_budget_positive CHECK (budget_total > 0),
  ADD CONSTRAINT ad_campaigns_spend_within_budget CHECK (spent >= 0 AND spent <= budget_total),
  ADD CONSTRAINT ad_campaigns_window CHECK (ends_at > starts_at),
  ADD CONSTRAINT ad_campaigns_one_boost_target CHECK (num_nonnulls(boost_post_id, boost_reel_id) <= 1);
ALTER TABLE ad_daily_stats
  ADD CONSTRAINT ad_daily_stats_nonnegative CHECK (impressions >= 0 AND clicks >= 0 AND spend >= 0);

-- ===== Partial and special indexes ==========================================

-- Only one reach configuration is live at a time.
CREATE UNIQUE INDEX reach_config_single_active ON reach_config_versions ((true)) WHERE status = 'ACTIVE';

-- A user has one primary bank account, and cannot add the same account twice.
CREATE UNIQUE INDEX payout_accounts_one_primary
  ON payout_accounts (user_id) WHERE is_primary AND removed_at IS NULL;
CREATE UNIQUE INDEX payout_accounts_no_duplicates
  ON payout_accounts (user_id, account_number_index, ifsc) WHERE removed_at IS NULL;

-- A user has at most one live identity case; a rejected one does not block a retry.
CREATE UNIQUE INDEX kyc_profiles_one_live_case
  ON kyc_profiles (user_id)
  WHERE status IN ('PENDING', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'VERIFIED');

-- The platform's own ledger accounts exist once each.
CREATE UNIQUE INDEX ledger_accounts_platform_singleton
  ON ledger_accounts (type) WHERE owner_user_id IS NULL;

-- Feed queries read only public, approved, live content: index exactly that.
CREATE INDEX posts_public_feed ON posts (published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED' AND deleted_at IS NULL;
CREATE INDEX posts_public_feed_state ON posts (state, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED' AND deleted_at IS NULL;
CREATE INDEX posts_public_feed_district ON posts (district, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED' AND deleted_at IS NULL;
CREATE INDEX posts_public_feed_reach ON posts (reach_level, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED' AND deleted_at IS NULL;

CREATE INDEX reels_public_feed ON reels (published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED'
    AND publish_status = 'PUBLISHED' AND deleted_at IS NULL;
CREATE INDEX reels_public_feed_state ON reels (state, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED'
    AND publish_status = 'PUBLISHED' AND deleted_at IS NULL;
CREATE INDEX reels_public_feed_district ON reels (district, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED'
    AND publish_status = 'PUBLISHED' AND deleted_at IS NULL;
CREATE INDEX reels_public_feed_reach ON reels (reach_level, published_at DESC, id DESC)
  WHERE visibility = 'PUBLIC' AND moderation_status = 'APPROVED'
    AND publish_status = 'PUBLISHED' AND deleted_at IS NULL;

-- Stories that have not expired and not been deleted.
CREATE INDEX stories_live ON stories (author_id, created_at DESC) WHERE deleted_at IS NULL;

-- The badge counter: unread notifications for a user.
CREATE INDEX notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Media that needs attention (admin "Media Processing" and "Upload Failures").
CREATE INDEX media_assets_in_flight ON media_assets (status, updated_at)
  WHERE status IN ('PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'PROCESSING', 'FAILED');

-- Open moderation work, most urgent first.
CREATE INDEX reports_open_queue ON reports (severity DESC, sla_due_at, created_at)
  WHERE status IN ('OPEN', 'IN_REVIEW', 'ESCALATED');

-- Fuzzy-search (trigram) indexes are declared in the Prisma schema, so Prisma
-- knows about them and never proposes dropping them.

-- ===== Append-only tables ===================================================

CREATE OR REPLACE FUNCTION forbid_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON financial_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON financial_ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER ledger_journals_append_only
  BEFORE UPDATE OR DELETE ON ledger_journals
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER ledger_journals_no_truncate
  BEFORE TRUNCATE ON ledger_journals
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

-- A published reach configuration is immutable, so any past score can be
-- reproduced from the version it was computed with.
CREATE OR REPLACE FUNCTION reach_config_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND NEW.config IS DISTINCT FROM OLD.config THEN
    RAISE EXCEPTION 'reach configuration version % is no longer a draft and cannot be edited', OLD.version
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'DRAFT' AND NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'reach configuration version numbers cannot change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reach_config_versions_guard
  BEFORE UPDATE ON reach_config_versions
  FOR EACH ROW EXECUTE FUNCTION reach_config_guard();

-- ===== The ledger ===========================================================
--
-- Balances are derived from entries by the database, never written by the app:
--   * a new account always starts at zero;
--   * an entry updates its account's balance in the same statement (taking a row
--     lock, so concurrent postings queue rather than race) and records the
--     balance after it;
--   * any other change to a balance is refused;
--   * a journal must balance (debits = credits) by the time the transaction commits;
--   * a creator's payable balance can never go negative (CHECK above).

CREATE OR REPLACE FUNCTION ledger_account_insert_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.balance := 0;
  NEW.version := 0;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_accounts_start_at_zero
  BEFORE INSERT ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION ledger_account_insert_guard();

CREATE OR REPLACE FUNCTION ledger_account_update_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.balance IS DISTINCT FROM OLD.balance OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.normal_side IS DISTINCT FROM OLD.normal_side
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id)
     AND COALESCE(current_setting('blocks.ledger_internal', true), '') <> '1' THEN
    RAISE EXCEPTION 'ledger account balances change only through ledger entries'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_accounts_guard
  BEFORE UPDATE ON ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION ledger_account_update_guard();

CREATE OR REPLACE FUNCTION ledger_apply_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  acc ledger_accounts%ROWTYPE;
  delta numeric(18, 2);
BEGIN
  SELECT * INTO acc FROM ledger_accounts WHERE id = NEW.account_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger account % does not exist', NEW.account_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  delta := CASE WHEN NEW.direction = acc.normal_side THEN NEW.amount ELSE -NEW.amount END;

  PERFORM set_config('blocks.ledger_internal', '1', true);
  UPDATE ledger_accounts
     SET balance = balance + delta, version = version + 1, updated_at = now()
   WHERE id = acc.id;
  PERFORM set_config('blocks.ledger_internal', '', true);

  NEW.balance_after := acc.balance + delta;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entries_apply
  BEFORE INSERT ON financial_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

CREATE OR REPLACE FUNCTION ledger_assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  diff numeric;
BEGIN
  SELECT COALESCE(SUM(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)
    INTO diff
    FROM financial_ledger_entries
   WHERE journal_id = NEW.journal_id;
  IF diff <> 0 THEN
    RAISE EXCEPTION 'ledger journal % does not balance (debits minus credits = %)', NEW.journal_id, diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_entries_journal_balanced
  AFTER INSERT ON financial_ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_journal_balanced();
