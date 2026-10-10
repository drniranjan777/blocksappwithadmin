-- Initial schema, generated from prisma/schema/*.prisma with
--   prisma migrate diff --from-empty --to-schema prisma/schema --script
-- Integrity rules that Prisma cannot express are in the next migration.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "business_status" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "verification_type" AS ENUM ('IDENTITY', 'BUSINESS', 'PUBLISHER');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ad_objective" AS ENUM ('AWARENESS', 'TRAFFIC', 'LOCAL_REACH', 'BOOST_CONTENT', 'LEADS');

-- CreateEnum
CREATE TYPE "ad_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "billing_status" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "content_visibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'CLOSE_FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "moderation_status" AS ENUM ('PENDING', 'APPROVED', 'RESTRICTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "reach_level" AS ENUM ('DISTRICT', 'STATE', 'NATIONAL', 'GLOBAL');

-- CreateEnum
CREATE TYPE "post_type" AS ENUM ('TEXT', 'PHOTO');

-- CreateEnum
CREATE TYPE "content_label" AS ENUM ('ORIGINAL', 'COMMUNITY_REPORT', 'UNVERIFIED', 'SOURCE_LINKED', 'VERIFIED_PUBLISHER', 'CORRECTED', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('PROCESSING', 'MODERATION', 'PUBLISHED', 'FAILED', 'REMOVED');

-- CreateEnum
CREATE TYPE "comment_status" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "share_channel" AS ENUM ('LINK', 'MESSAGE', 'EXTERNAL', 'REPOST');

-- CreateEnum
CREATE TYPE "trend_scope" AS ENUM ('DISTRICT', 'STATE', 'NATIONAL', 'GLOBAL');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('NEW_FOLLOWER', 'FOLLOW_REQUEST', 'LIKE', 'COMMENT', 'MENTION', 'REACH_MILESTONE', 'EARNINGS', 'SECURITY_ALERT', 'PASSWORD_CHANGED', 'NEW_DEVICE_LOGIN', 'KYC_STATUS', 'PAYOUT_STATUS', 'MODERATION_DECISION', 'CAMPAIGN_STATUS', 'SYSTEM');

-- CreateEnum
CREATE TYPE "delivery_channel" AS ENUM ('EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'RESTRICTED', 'PENDING_DELETION', 'DELETED');

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('PERSONAL', 'CREATOR', 'BUSINESS', 'PUBLISHER');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "two_factor_method" AS ENUM ('TOTP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "verification_badge" AS ENUM ('NONE', 'IDENTITY', 'OFFICIAL_BUSINESS', 'VERIFIED_PUBLISHER');

-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('ANDROID', 'IOS', 'WEB', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('LOGOUT', 'USER_REVOKED', 'LOGOUT_OTHERS', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'SECURITY', 'REUSE_DETECTED', 'ADMIN', 'ACCOUNT_DELETED');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA', 'TWO_FACTOR_SETUP', 'CONTACT_CHANGE', 'ACCOUNT_RECOVERY', 'ACCOUNT_DELETION', 'STEP_UP');

-- CreateEnum
CREATE TYPE "otp_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "step_up_purpose" AS ENUM ('ADD_BANK_ACCOUNT', 'CHANGE_BANK_ACCOUNT', 'REMOVE_BANK_ACCOUNT', 'REQUEST_PAYOUT', 'UPDATE_TAX_INFO');

-- CreateEnum
CREATE TYPE "security_event_type" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_BLOCKED', 'SUSPICIOUS_LOGIN', 'NEW_DEVICE_LOGIN', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'EMAIL_CHANGED', 'PHONE_CHANGED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'SESSION_REVOKED', 'ALL_SESSIONS_REVOKED', 'REFRESH_TOKEN_REUSE', 'ACCOUNT_RECOVERED', 'ACCOUNT_DELETION_REQUESTED', 'ACCOUNT_DELETION_CANCELLED', 'PAYOUT_ACCOUNT_CHANGED', 'IDENTITY_DETAILS_CHANGED', 'ADMIN_ACTION');

-- CreateEnum
CREATE TYPE "security_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "follow_status" AS ENUM ('ACCEPTED', 'PENDING');

-- CreateEnum
CREATE TYPE "block_kind" AS ENUM ('BLOCK', 'MUTE', 'RESTRICT');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('VIDEO', 'IMAGE', 'AUDIO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "media_purpose" AS ENUM ('POST_IMAGE', 'REEL_VIDEO', 'REEL_CLIP', 'REEL_COVER', 'STORY', 'AVATAR', 'BUSINESS_IMAGE', 'AD_CREATIVE', 'MUSIC_PREVIEW', 'MUSIC_COVER', 'KYC_DOCUMENT');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'VALIDATING', 'PROCESSING', 'READY', 'REJECTED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "media_profile_key" AS ENUM ('DATA_SAVER', 'BALANCED', 'HIGH');

-- CreateEnum
CREATE TYPE "upload_status" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "media_job_type" AS ENUM ('VALIDATE', 'TRANSCODE', 'THUMBNAIL', 'MODERATE', 'DELETE');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "music_rights_type" AS ENUM ('PLATFORM_OWNED', 'LICENSED', 'CREATOR_OWNED', 'ROYALTY_FREE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "music_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "music_category" AS ENUM ('TRENDING', 'POPULAR', 'NEW_RELEASES', 'HINDI', 'TELUGU', 'TAMIL', 'BENGALI', 'MARATHI', 'PUNJABI', 'KANNADA', 'MALAYALAM', 'INSTRUMENTAL', 'DEVOTIONAL', 'TRAVEL', 'FITNESS', 'ROMANTIC', 'COMEDY');

-- CreateEnum
CREATE TYPE "music_use" AS ENUM ('REEL', 'STORY', 'POST', 'ADVERTISING');

-- CreateEnum
CREATE TYPE "licence_status" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "monetization_status" AS ENUM ('NOT_ELIGIBLE', 'ELIGIBLE', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "cycle_status" AS ENUM ('OPEN', 'CALCULATING', 'CLOSED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "earning_status" AS ENUM ('ESTIMATED', 'FINALIZED', 'ADJUSTED', 'VOID');

-- CreateEnum
CREATE TYPE "ledger_account_type" AS ENUM ('CREATOR_PAYABLE', 'REWARD_POOL', 'PAYOUT_CLEARING', 'BANK_SETTLEMENT', 'ADJUSTMENTS');

-- CreateEnum
CREATE TYPE "ledger_direction" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ledger_journal_type" AS ENUM ('REWARD_FINALIZED', 'REWARD_REVERSED', 'PAYOUT_REQUESTED', 'PAYOUT_COMPLETED', 'PAYOUT_FAILED', 'PAYOUT_REVERSED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('ADMIN', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "bank_account_type" AS ENUM ('SAVINGS', 'CURRENT');

-- CreateEnum
CREATE TYPE "payout_account_status" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "name_match" AS ENUM ('MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'ON_HOLD', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "approval_decision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "kyc_subject" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('NOT_STARTED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'ACTION_REQUIRED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "kyc_doc_type" AS ENUM ('AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENCE', 'GST_CERTIFICATE', 'UDYAM', 'BUSINESS_PAN', 'INCORPORATION');

-- CreateEnum
CREATE TYPE "kyc_doc_role" AS ENUM ('PRIMARY', 'SIGNATORY');

-- CreateEnum
CREATE TYPE "kyc_doc_status" AS ENUM ('RECEIVED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "kyc_decision" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO');

-- CreateEnum
CREATE TYPE "tax_status" AS ENUM ('NOT_PROVIDED', 'PROVIDED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "reach_event_type" AS ENUM ('IMPRESSION', 'QUALIFIED_VIEW', 'WATCH', 'COMPLETE', 'SHARE', 'SAVE', 'COMMENT', 'LIKE');

-- CreateEnum
CREATE TYPE "config_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('POST', 'REEL', 'STORY', 'COMMENT', 'USER', 'LIVE', 'MESSAGE');

-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('MISINFORMATION', 'VIOLENCE', 'FRAUD', 'HARASSMENT', 'SPAM', 'COPYRIGHT', 'NUDITY', 'SELF_HARM', 'CHILD_SAFETY', 'FAKE_ENGAGEMENT', 'DEEPFAKE', 'OTHER');

-- CreateEnum
CREATE TYPE "report_source" AS ENUM ('USER', 'AUTOMATED', 'ADMIN');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('APPROVE', 'RESTRICT', 'REMOVE', 'RESTORE', 'LABEL', 'WARN', 'SUSPEND_USER', 'RESTRICT_USER', 'REACTIVATE_USER', 'ESCALATE', 'DISMISS_REPORT');

-- CreateEnum
CREATE TYPE "appeal_kind" AS ENUM ('MODERATION', 'EARNINGS', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "appeal_status" AS ENUM ('OPEN', 'IN_REVIEW', 'UPHELD', 'OVERTURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "live_status" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "incident_type" AS ENUM ('SELF_HARM', 'VIOLENCE', 'SCAM', 'CHILD_SAFETY', 'HARASSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "admin_status" NOT NULL DEFAULT 'INVITED',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_enc" TEXT,
    "two_factor_backup_hashes" TEXT[],
    "two_factor_last_step" INTEGER,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "previous_token_hash" VARCHAR(64),
    "rotated_at" TIMESTAMPTZ(3),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "mfa_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revoke_reason",

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "description" VARCHAR(300),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "admin_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("admin_id","role_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "actor_label" VARCHAR(160),
    "action" VARCHAR(80) NOT NULL,
    "target_type" VARCHAR(40),
    "target_id" VARCHAR(64),
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "request_id" VARCHAR(64),
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(120) NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "day" DATE NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "scope" VARCHAR(80) NOT NULL DEFAULT 'global',
    "value" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("day","key","scope")
);

-- CreateTable
CREATE TABLE "business_pages" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "description" VARCHAR(1000),
    "contact_email" VARCHAR(254),
    "website_url" VARCHAR(200),
    "state" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(80),
    "avatar_media_id" UUID,
    "cover_media_id" UUID,
    "status" "business_status" NOT NULL DEFAULT 'DRAFT',
    "verification_status" "verification_status" NOT NULL DEFAULT 'NONE',
    "gstin_enc" TEXT,
    "gstin_last4" VARCHAR(4),
    "followers_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_follows" (
    "page_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_follows_pkey" PRIMARY KEY ("page_id","user_id")
);

-- CreateTable
CREATE TABLE "business_offers" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(400),
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_page_id" UUID,
    "type" "verification_type" NOT NULL,
    "status" "verification_status" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(500),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" UUID NOT NULL,
    "advertiser_id" UUID NOT NULL,
    "business_page_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "objective" "ad_objective" NOT NULL,
    "status" "ad_status" NOT NULL DEFAULT 'DRAFT',
    "budget_total" DECIMAL(18,2) NOT NULL,
    "daily_budget" DECIMAL(18,2),
    "spent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "targeting" JSONB NOT NULL,
    "headline" VARCHAR(120) NOT NULL,
    "body" VARCHAR(400),
    "destination_url" VARCHAR(300),
    "boost_post_id" UUID,
    "boost_reel_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(500),
    "policy_flags" JSONB,
    "billing_status" "billing_status" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_daily_stats" (
    "campaign_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_stats_pkey" PRIMARY KEY ("campaign_id","day")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "business_page_id" UUID,
    "type" "post_type" NOT NULL DEFAULT 'TEXT',
    "caption" VARCHAR(2200) NOT NULL,
    "visibility" "content_visibility" NOT NULL DEFAULT 'PUBLIC',
    "hashtags" TEXT[],
    "mentioned_user_ids" UUID[],
    "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "state" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(80),
    "label" "content_label" NOT NULL DEFAULT 'ORIGINAL',
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "reach_level" "reach_level" NOT NULL DEFAULT 'DISTRICT',
    "qualified_reach" INTEGER NOT NULL DEFAULT 0,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "saves_count" INTEGER NOT NULL DEFAULT 0,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "allow_comments" BOOLEAN NOT NULL DEFAULT true,
    "allow_sharing" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "post_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("post_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "reels" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "media_asset_id" UUID,
    "cover_media_id" UUID,
    "caption" VARCHAR(2200) NOT NULL,
    "visibility" "content_visibility" NOT NULL DEFAULT 'PUBLIC',
    "hashtags" TEXT[],
    "mentioned_user_ids" UUID[],
    "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "state" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(80),
    "duration_ms" INTEGER NOT NULL,
    "clip_count" INTEGER NOT NULL DEFAULT 1,
    "music_track_id" UUID,
    "music_start_ms" INTEGER,
    "music_end_ms" INTEGER,
    "reused_audio_id" UUID,
    "edit_metadata" JSONB,
    "publish_status" "publish_status" NOT NULL DEFAULT 'PROCESSING',
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "failure_code" VARCHAR(60),
    "label" "content_label" NOT NULL DEFAULT 'ORIGINAL',
    "reach_level" "reach_level" NOT NULL DEFAULT 'DISTRICT',
    "qualified_reach" INTEGER NOT NULL DEFAULT 0,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "shares_count" INTEGER NOT NULL DEFAULT 0,
    "saves_count" INTEGER NOT NULL DEFAULT 0,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "allow_comments" BOOLEAN NOT NULL DEFAULT true,
    "allow_remix" BOOLEAN NOT NULL DEFAULT true,
    "allow_sharing" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_clips" (
    "id" UUID NOT NULL,
    "reel_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_photo" BOOLEAN NOT NULL DEFAULT false,
    "start_ms" INTEGER NOT NULL DEFAULT 0,
    "end_ms" INTEGER NOT NULL,
    "volume" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "filter_id" VARCHAR(40),
    "filter_intensity" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "transition_id" VARCHAR(40),
    "adjustments" JSONB,

    CONSTRAINT "reel_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "original_audios" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "source_reel_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "original_audios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "caption" VARCHAR(200),
    "visibility" "content_visibility" NOT NULL DEFAULT 'FOLLOWERS',
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "story_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("story_id","viewer_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "status" "comment_status" NOT NULL DEFAULT 'VISIBLE',
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "replies_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "comment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shares" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "channel" "share_channel" NOT NULL DEFAULT 'LINK',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saves" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trending_topics" (
    "id" UUID NOT NULL,
    "scope" "trend_scope" NOT NULL,
    "scope_key" VARCHAR(80) NOT NULL DEFAULT '',
    "tag" VARCHAR(60) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "posts_count" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trending_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(400) NOT NULL,
    "data" JSONB,
    "dedupe_key" VARCHAR(160),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "user_id" UUID NOT NULL,
    "channel" "delivery_channel" NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'QUEUED',
    "template" VARCHAR(60) NOT NULL,
    "subject" VARCHAR(200),
    "payload" JSONB,
    "to_masked" VARCHAR(100),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "provider_message_id" VARCHAR(120),
    "next_attempt_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "direct_key" VARCHAR(80),
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3),
    "muted_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "email" VARCHAR(254),
    "email_verified_at" TIMESTAMPTZ(3),
    "phone" VARCHAR(16),
    "phone_verified_at" TIMESTAMPTZ(3),
    "password_hash" VARCHAR(255) NOT NULL,
    "password_changed_at" TIMESTAMPTZ(3),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" VARCHAR(300),
    "status_changed_at" TIMESTAMPTZ(3),
    "account_type" "account_type" NOT NULL DEFAULT 'PERSONAL',
    "risk_level" "risk_level" NOT NULL DEFAULT 'LOW',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_method" "two_factor_method",
    "two_factor_secret_enc" TEXT,
    "two_factor_backup_hashes" TEXT[],
    "two_factor_last_step" INTEGER,
    "last_active_at" TIMESTAMPTZ(3),
    "deletion_requested_at" TIMESTAMPTZ(3),
    "deletion_scheduled_for" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "bio" VARCHAR(300),
    "website_url" VARCHAR(200),
    "avatar_media_id" UUID,
    "country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "state" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(80),
    "date_of_birth" DATE,
    "gender" VARCHAR(20),
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "badge" "verification_badge" NOT NULL DEFAULT 'NONE',
    "followers_count" INTEGER NOT NULL DEFAULT 0,
    "following_count" INTEGER NOT NULL DEFAULT 0,
    "posts_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "language" VARCHAR(8) NOT NULL DEFAULT 'en',
    "who_can_comment" VARCHAR(20) NOT NULL DEFAULT 'everyone',
    "who_can_message" VARCHAR(20) NOT NULL DEFAULT 'followers',
    "show_sensitive_content" BOOLEAN NOT NULL DEFAULT false,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "security_alert_email" BOOLEAN NOT NULL DEFAULT true,
    "security_alert_push" BOOLEAN NOT NULL DEFAULT true,
    "login_alerts" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "previous_token_hash" VARCHAR(64),
    "rotated_at" TIMESTAMPTZ(3),
    "device_id" VARCHAR(100),
    "device_name" VARCHAR(120),
    "platform" "device_platform" NOT NULL DEFAULT 'UNKNOWN',
    "app_version" VARCHAR(32),
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(400),
    "location_label" VARCHAR(120),
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "mfa_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revoke_reason",

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "platform" "device_platform" NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "purpose" "otp_purpose" NOT NULL,
    "channel" "otp_channel" NOT NULL,
    "destination_masked" VARCHAR(100) NOT NULL,
    "destination_hash" VARCHAR(64) NOT NULL,
    "pending_value" VARCHAR(254),
    "code_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_up_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "step_up_purpose" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "step_up_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "security_event_type" NOT NULL,
    "severity" "security_severity" NOT NULL DEFAULT 'INFO',
    "session_id" UUID,
    "ip" VARCHAR(45),
    "device_label" VARCHAR(120),
    "location_label" VARCHAR(120),
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "acknowledged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "kind" "block_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id","kind")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "status" "follow_status" NOT NULL DEFAULT 'ACCEPTED',
    "close_friend" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "purpose" "media_purpose" NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "bucket" VARCHAR(63) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_filename" VARCHAR(255),
    "declared_mime" VARCHAR(100) NOT NULL,
    "declared_size_bytes" INTEGER NOT NULL,
    "detected_mime" VARCHAR(100),
    "size_bytes" INTEGER,
    "sha256" VARCHAR(64),
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "probe" JSONB,
    "profile" "media_profile_key",
    "renditions" JSONB,
    "thumbnail_key" VARCHAR(512),
    "poster_key" VARCHAR(512),
    "manifest_key" VARCHAR(512),
    "moderation_status" "moderation_status" NOT NULL DEFAULT 'PENDING',
    "failure_code" VARCHAR(60),
    "failure_detail" VARCHAR(500),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "uploaded_at" TIMESTAMPTZ(3),
    "processed_at" TIMESTAMPTZ(3),
    "delete_after" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "upload_status" NOT NULL DEFAULT 'OPEN',
    "multipart_upload_id" VARCHAR(255),
    "part_size_bytes" INTEGER NOT NULL,
    "total_bytes" INTEGER NOT NULL,
    "uploaded_bytes" INTEGER NOT NULL DEFAULT 0,
    "parts" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_jobs" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "type" "media_job_type" NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" VARCHAR(1000),
    "queue_job_id" VARCHAR(100),
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "artist" VARCHAR(120) NOT NULL,
    "language" VARCHAR(40) NOT NULL,
    "genre" VARCHAR(60) NOT NULL DEFAULT '',
    "duration_ms" INTEGER NOT NULL,
    "categories" "music_category"[],
    "rights_type" "music_rights_type" NOT NULL,
    "status" "music_status" NOT NULL DEFAULT 'DRAFT',
    "allowed_countries" TEXT[],
    "allowed_uses" "music_use"[],
    "licence_expires_at" TIMESTAMPTZ(3),
    "cover_key" VARCHAR(512),
    "preview_key" VARCHAR(512),
    "audio_key" VARCHAR(512),
    "reels_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_licences" (
    "id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "licensor" VARCHAR(160) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "rights_type" "music_rights_type" NOT NULL,
    "territories" TEXT[],
    "status" "licence_status" NOT NULL DEFAULT 'PENDING',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "restrictions" JSONB,
    "document_key" VARCHAR(512),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "music_licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_profiles" (
    "user_id" UUID NOT NULL,
    "monetization_status" "monetization_status" NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "eligible_since" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspended_reason" VARCHAR(300),
    "suspended_by_id" UUID,
    "payout_hold_until" TIMESTAMPTZ(3),
    "payout_hold_reason" VARCHAR(200),
    "best_reach_level" "reach_level" NOT NULL DEFAULT 'DISTRICT',
    "qualified_reach30d" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "reward_cycles" (
    "id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "cycle_status" NOT NULL DEFAULT 'OPEN',
    "pool_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "config_version_id" UUID,
    "finalized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_earnings" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "status" "earning_status" NOT NULL DEFAULT 'ESTIMATED',
    "estimated_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "finalized_amount" DECIMAL(18,2),
    "qualified_reach" INTEGER NOT NULL DEFAULT 0,
    "reach_level" "reach_level" NOT NULL DEFAULT 'DISTRICT',
    "scoring_version" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "journal_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "creator_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "type" "ledger_account_type" NOT NULL,
    "owner_user_id" UUID,
    "normal_side" "ledger_direction" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_journals" (
    "id" UUID NOT NULL,
    "type" "ledger_journal_type" NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "memo" VARCHAR(300),
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "reversal_of_id" UUID,
    "created_by_type" "actor_type" NOT NULL DEFAULT 'SYSTEM',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger_entries" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "ledger_direction" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "holder_name_enc" TEXT NOT NULL,
    "account_number_enc" TEXT NOT NULL,
    "account_number_last4" VARCHAR(4) NOT NULL,
    "account_number_index" VARCHAR(64) NOT NULL,
    "ifsc" VARCHAR(11) NOT NULL,
    "bank_name" VARCHAR(120) NOT NULL,
    "branch" VARCHAR(120),
    "account_type" "bank_account_type" NOT NULL DEFAULT 'SAVINGS',
    "status" "payout_account_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "name_match" "name_match",
    "verified_at" TIMESTAMPTZ(3),
    "provider_ref" VARCHAR(120),
    "failure_code" VARCHAR(60),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" "payout_status" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "hold_journal_id" UUID,
    "settle_journal_id" UUID,
    "provider_reference" VARCHAR(120),
    "failure_code" VARCHAR(60),
    "hold_reason" VARCHAR(200),
    "risk_flags" JSONB,
    "estimated_from" TIMESTAMPTZ(3),
    "estimated_to" TIMESTAMPTZ(3),
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "processing_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_approvals" (
    "id" UUID NOT NULL,
    "payout_request_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decision" "approval_decision" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" "kyc_subject" NOT NULL,
    "status" "kyc_status" NOT NULL DEFAULT 'PENDING',
    "legal_name_enc" TEXT NOT NULL,
    "legal_name_masked" VARCHAR(80) NOT NULL,
    "date_of_birth_enc" TEXT,
    "business_name_enc" TEXT,
    "business_type" VARCHAR(60),
    "pan_enc" TEXT,
    "pan_last4" VARCHAR(4),
    "pan_index" VARCHAR(64),
    "provider_reference" VARCHAR(120),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reason_code" VARCHAR(60),
    "expires_at" TIMESTAMPTZ(3),
    "retention_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "type" "kyc_doc_type" NOT NULL,
    "role" "kyc_doc_role" NOT NULL DEFAULT 'PRIMARY',
    "number_enc" TEXT,
    "number_last4" VARCHAR(4),
    "number_index" VARCHAR(64),
    "file_asset_id" UUID,
    "back_file_asset_id" UUID,
    "status" "kyc_doc_status" NOT NULL DEFAULT 'RECEIVED',
    "rejection_code" VARCHAR(60),
    "retention_until" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_reviews" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decision" "kyc_decision" NOT NULL,
    "reason_code" VARCHAR(60),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_profiles" (
    "user_id" UUID NOT NULL,
    "status" "tax_status" NOT NULL DEFAULT 'NOT_PROVIDED',
    "pan_enc" TEXT,
    "pan_last4" VARCHAR(4),
    "pan_index" VARCHAR(64),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "reach_events" (
    "id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "viewer_id" UUID,
    "device_hash" VARCHAR(64),
    "type" "reach_event_type" NOT NULL,
    "watch_ms" INTEGER,
    "viewer_country" VARCHAR(2),
    "viewer_state" VARCHAR(80),
    "viewer_district" VARCHAR(80),
    "dedupe_key" VARCHAR(160),
    "fraud_score" INTEGER NOT NULL DEFAULT 0,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reach_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reach_config_versions" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "config_status" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "note" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by_id" UUID,
    "activated_at" TIMESTAMPTZ(3),

    CONSTRAINT "reach_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reach_scores" (
    "id" UUID NOT NULL,
    "post_id" UUID,
    "reel_id" UUID,
    "config_version_id" UUID NOT NULL,
    "qualified_reach" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "signals" JSONB NOT NULL,
    "distinct_districts" INTEGER NOT NULL DEFAULT 0,
    "distinct_states" INTEGER NOT NULL DEFAULT 0,
    "distinct_countries" INTEGER NOT NULL DEFAULT 0,
    "excluded_events" INTEGER NOT NULL DEFAULT 0,
    "level" "reach_level" NOT NULL,
    "previous_level" "reach_level",
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reach_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID,
    "source" "report_source" NOT NULL DEFAULT 'USER',
    "target_type" "report_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "target_user_id" UUID,
    "category" "report_category" NOT NULL,
    "description" VARCHAR(1000),
    "evidence" JSONB,
    "severity" "severity" NOT NULL DEFAULT 'MEDIUM',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" UUID,
    "sla_due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "report_id" UUID,
    "admin_id" UUID,
    "source" "report_source" NOT NULL DEFAULT 'ADMIN',
    "target_type" "report_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" "moderation_action_type" NOT NULL,
    "policy_reason" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(1000),
    "reversal_of_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "appeal_kind" NOT NULL,
    "moderation_action_id" UUID,
    "subject_type" VARCHAR(40),
    "subject_id" UUID,
    "reason" VARCHAR(2000) NOT NULL,
    "status" "appeal_status" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" UUID,
    "decided_by_id" UUID,
    "decision_note" VARCHAR(1000),
    "sla_due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "status" "live_status" NOT NULL DEFAULT 'SCHEDULED',
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "peak_viewers" INTEGER NOT NULL DEFAULT 0,
    "risk_flags" JSONB,
    "terminated_by_id" UUID,
    "termination_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" UUID NOT NULL,
    "type" "incident_type" NOT NULL,
    "severity" "severity" NOT NULL DEFAULT 'HIGH',
    "status" "incident_status" NOT NULL DEFAULT 'OPEN',
    "user_id" UUID,
    "live_session_id" UUID,
    "summary" VARCHAR(1000) NOT NULL,
    "action_taken" VARCHAR(500),
    "escalated_to" VARCHAR(160),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_status_idx" ON "admin_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_refresh_token_hash_key" ON "admin_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_previous_token_hash_key" ON "admin_sessions"("previous_token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_revoked_at_idx" ON "admin_sessions"("admin_id", "revoked_at");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "admin_user_roles_role_id_idx" ON "admin_user_roles"("role_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_created_at_idx" ON "audit_logs"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_sensitive_created_at_idx" ON "audit_logs"("sensitive", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE INDEX "daily_metrics_key_day_idx" ON "daily_metrics"("key", "day");

-- CreateIndex
CREATE UNIQUE INDEX "business_pages_slug_key" ON "business_pages"("slug");

-- CreateIndex
CREATE INDEX "business_pages_owner_id_idx" ON "business_pages"("owner_id");

-- CreateIndex
CREATE INDEX "business_pages_status_verification_status_idx" ON "business_pages"("status", "verification_status");

-- CreateIndex
CREATE INDEX "business_pages_state_district_idx" ON "business_pages"("state", "district");

-- CreateIndex
CREATE INDEX "business_pages_name_trgm" ON "business_pages" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "business_follows_user_id_idx" ON "business_follows"("user_id");

-- CreateIndex
CREATE INDEX "business_offers_page_id_ends_at_idx" ON "business_offers"("page_id", "ends_at");

-- CreateIndex
CREATE INDEX "verification_requests_status_type_submitted_at_idx" ON "verification_requests"("status", "type", "submitted_at");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE INDEX "ad_campaigns_status_starts_at_idx" ON "ad_campaigns"("status", "starts_at");

-- CreateIndex
CREATE INDEX "ad_campaigns_advertiser_id_created_at_idx" ON "ad_campaigns"("advertiser_id", "created_at");

-- CreateIndex
CREATE INDEX "ad_campaigns_billing_status_idx" ON "ad_campaigns"("billing_status");

-- CreateIndex
CREATE INDEX "posts_author_id_published_at_idx" ON "posts"("author_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_visibility_moderation_status_published_at_idx" ON "posts"("visibility", "moderation_status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_state_published_at_idx" ON "posts"("state", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_district_published_at_idx" ON "posts"("district", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_reach_level_published_at_idx" ON "posts"("reach_level", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_hashtags_idx" ON "posts" USING GIN ("hashtags");

-- CreateIndex
CREATE INDEX "post_media_media_asset_id_idx" ON "post_media"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "reels_media_asset_id_key" ON "reels"("media_asset_id");

-- CreateIndex
CREATE INDEX "reels_author_id_created_at_idx" ON "reels"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reels_publish_status_moderation_status_visibility_published_idx" ON "reels"("publish_status", "moderation_status", "visibility", "published_at" DESC);

-- CreateIndex
CREATE INDEX "reels_state_published_at_idx" ON "reels"("state", "published_at" DESC);

-- CreateIndex
CREATE INDEX "reels_district_published_at_idx" ON "reels"("district", "published_at" DESC);

-- CreateIndex
CREATE INDEX "reels_reach_level_published_at_idx" ON "reels"("reach_level", "published_at" DESC);

-- CreateIndex
CREATE INDEX "reels_music_track_id_idx" ON "reels"("music_track_id");

-- CreateIndex
CREATE INDEX "reels_hashtags_idx" ON "reels" USING GIN ("hashtags");

-- CreateIndex
CREATE INDEX "reel_clips_media_asset_id_idx" ON "reel_clips"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "reel_clips_reel_id_position_key" ON "reel_clips"("reel_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "original_audios_source_reel_id_key" ON "original_audios"("source_reel_id");

-- CreateIndex
CREATE INDEX "original_audios_owner_id_idx" ON "original_audios"("owner_id");

-- CreateIndex
CREATE INDEX "stories_author_id_expires_at_idx" ON "stories"("author_id", "expires_at");

-- CreateIndex
CREATE INDEX "stories_expires_at_idx" ON "stories"("expires_at");

-- CreateIndex
CREATE INDEX "story_views_viewer_id_viewed_at_idx" ON "story_views"("viewer_id", "viewed_at");

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_reel_id_created_at_idx" ON "comments"("reel_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_parent_id_created_at_idx" ON "comments"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_author_id_created_at_idx" ON "comments"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "likes_post_id_idx" ON "likes"("post_id");

-- CreateIndex
CREATE INDEX "likes_reel_id_idx" ON "likes"("reel_id");

-- CreateIndex
CREATE INDEX "likes_comment_id_idx" ON "likes"("comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_post_id_key" ON "likes"("user_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_reel_id_key" ON "likes"("user_id", "reel_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_comment_id_key" ON "likes"("user_id", "comment_id");

-- CreateIndex
CREATE INDEX "shares_post_id_created_at_idx" ON "shares"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "shares_reel_id_created_at_idx" ON "shares"("reel_id", "created_at");

-- CreateIndex
CREATE INDEX "shares_user_id_created_at_idx" ON "shares"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "saves_user_id_created_at_idx" ON "saves"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saves_user_id_post_id_key" ON "saves"("user_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "saves_user_id_reel_id_key" ON "saves"("user_id", "reel_id");

-- CreateIndex
CREATE INDEX "trending_topics_scope_scope_key_score_idx" ON "trending_topics"("scope", "scope_key", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trending_topics_scope_scope_key_tag_key" ON "trending_topics"("scope", "scope_key", "tag");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_user_id_channel_created_at_idx" ON "notification_deliveries"("user_id", "channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_direct_key_key" ON "conversations"("direct_key");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_account_type_status_idx" ON "users"("account_type", "status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- CreateIndex
CREATE INDEX "users_risk_level_idx" ON "users"("risk_level");

-- CreateIndex
CREATE INDEX "users_username_trgm" ON "users" USING GIN ("username" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_avatar_media_id_key" ON "profiles"("avatar_media_id");

-- CreateIndex
CREATE INDEX "profiles_country_state_district_idx" ON "profiles"("country", "state", "district");

-- CreateIndex
CREATE INDEX "profiles_display_name_trgm" ON "profiles" USING GIN ("display_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_previous_token_hash_key" ON "user_sessions"("previous_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_last_used_at_idx" ON "user_sessions"("user_id", "last_used_at");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_user_id_disabled_at_idx" ON "push_devices"("user_id", "disabled_at");

-- CreateIndex
CREATE INDEX "otp_challenges_user_id_purpose_created_at_idx" ON "otp_challenges"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_hash_purpose_created_at_idx" ON "otp_challenges"("destination_hash", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_expires_at_idx" ON "otp_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "step_up_tokens_token_hash_key" ON "step_up_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "step_up_tokens_user_id_purpose_idx" ON "step_up_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "security_events_user_id_severity_acknowledged_at_idx" ON "security_events"("user_id", "severity", "acknowledged_at");

-- CreateIndex
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "follows_followee_id_status_created_at_idx" ON "follows"("followee_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "follows_follower_id_status_created_at_idx" ON "follows"("follower_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_status_updated_at_idx" ON "media_assets"("status", "updated_at");

-- CreateIndex
CREATE INDEX "media_assets_purpose_status_idx" ON "media_assets"("purpose", "status");

-- CreateIndex
CREATE INDEX "media_assets_delete_after_idx" ON "media_assets"("delete_after");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_asset_id_key" ON "upload_sessions"("asset_id");

-- CreateIndex
CREATE INDEX "upload_sessions_user_id_status_idx" ON "upload_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "upload_sessions_status_expires_at_idx" ON "upload_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "media_jobs_asset_id_type_idx" ON "media_jobs"("asset_id", "type");

-- CreateIndex
CREATE INDEX "media_jobs_status_queued_at_idx" ON "media_jobs"("status", "queued_at");

-- CreateIndex
CREATE INDEX "music_tracks_status_rights_type_idx" ON "music_tracks"("status", "rights_type");

-- CreateIndex
CREATE INDEX "music_tracks_categories_idx" ON "music_tracks" USING GIN ("categories");

-- CreateIndex
CREATE INDEX "music_tracks_reels_count_idx" ON "music_tracks"("reels_count" DESC);

-- CreateIndex
CREATE INDEX "music_licences_track_id_status_idx" ON "music_licences"("track_id", "status");

-- CreateIndex
CREATE INDEX "music_licences_status_expires_at_idx" ON "music_licences"("status", "expires_at");

-- CreateIndex
CREATE INDEX "creator_profiles_monetization_status_idx" ON "creator_profiles"("monetization_status");

-- CreateIndex
CREATE UNIQUE INDEX "reward_cycles_label_key" ON "reward_cycles"("label");

-- CreateIndex
CREATE INDEX "reward_cycles_status_starts_at_idx" ON "reward_cycles"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "creator_earnings_journal_id_key" ON "creator_earnings"("journal_id");

-- CreateIndex
CREATE INDEX "creator_earnings_cycle_id_status_idx" ON "creator_earnings"("cycle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "creator_earnings_creator_id_cycle_id_key" ON "creator_earnings"("creator_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_owner_user_id_type_key" ON "ledger_accounts"("owner_user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_journals_idempotency_key_key" ON "ledger_journals"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_journals_reversal_of_id_key" ON "ledger_journals"("reversal_of_id");

-- CreateIndex
CREATE INDEX "ledger_journals_reference_type_reference_id_idx" ON "ledger_journals"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_journals_created_at_idx" ON "ledger_journals"("created_at");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_journal_id_idx" ON "financial_ledger_entries"("journal_id");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_account_id_created_at_idx" ON "financial_ledger_entries"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payout_accounts_user_id_removed_at_idx" ON "payout_accounts"("user_id", "removed_at");

-- CreateIndex
CREATE INDEX "payout_accounts_account_number_index_idx" ON "payout_accounts"("account_number_index");

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_hold_journal_id_key" ON "payout_requests"("hold_journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_settle_journal_id_key" ON "payout_requests"("settle_journal_id");

-- CreateIndex
CREATE INDEX "payout_requests_status_requested_at_idx" ON "payout_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "payout_requests_user_id_requested_at_idx" ON "payout_requests"("user_id", "requested_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_user_id_idempotency_key_key" ON "payout_requests"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payout_approvals_payout_request_id_admin_id_key" ON "payout_approvals"("payout_request_id", "admin_id");

-- CreateIndex
CREATE INDEX "kyc_profiles_user_id_status_idx" ON "kyc_profiles"("user_id", "status");

-- CreateIndex
CREATE INDEX "kyc_profiles_status_submitted_at_idx" ON "kyc_profiles"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "kyc_profiles_pan_index_idx" ON "kyc_profiles"("pan_index");

-- CreateIndex
CREATE INDEX "kyc_documents_kyc_profile_id_idx" ON "kyc_documents"("kyc_profile_id");

-- CreateIndex
CREATE INDEX "kyc_documents_type_number_index_idx" ON "kyc_documents"("type", "number_index");

-- CreateIndex
CREATE INDEX "kyc_documents_retention_until_idx" ON "kyc_documents"("retention_until");

-- CreateIndex
CREATE INDEX "kyc_reviews_kyc_profile_id_created_at_idx" ON "kyc_reviews"("kyc_profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reach_events_dedupe_key_key" ON "reach_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "reach_events_reel_id_created_at_idx" ON "reach_events"("reel_id", "created_at");

-- CreateIndex
CREATE INDEX "reach_events_post_id_created_at_idx" ON "reach_events"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "reach_events_viewer_id_created_at_idx" ON "reach_events"("viewer_id", "created_at");

-- CreateIndex
CREATE INDEX "reach_events_device_hash_created_at_idx" ON "reach_events"("device_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reach_config_versions_version_key" ON "reach_config_versions"("version");

-- CreateIndex
CREATE INDEX "reach_config_versions_status_idx" ON "reach_config_versions"("status");

-- CreateIndex
CREATE INDEX "reach_scores_reel_id_computed_at_idx" ON "reach_scores"("reel_id", "computed_at" DESC);

-- CreateIndex
CREATE INDEX "reach_scores_post_id_computed_at_idx" ON "reach_scores"("post_id", "computed_at" DESC);

-- CreateIndex
CREATE INDEX "reach_scores_config_version_id_idx" ON "reach_scores"("config_version_id");

-- CreateIndex
CREATE INDEX "reports_status_severity_sla_due_at_idx" ON "reports"("status", "severity", "sla_due_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_target_user_id_created_at_idx" ON "reports"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_assigned_to_id_status_idx" ON "reports"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_actions_reversal_of_id_key" ON "moderation_actions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "moderation_actions_target_type_target_id_created_at_idx" ON "moderation_actions"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_target_user_id_created_at_idx" ON "moderation_actions"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_admin_id_created_at_idx" ON "moderation_actions"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "appeals_status_sla_due_at_idx" ON "appeals"("status", "sla_due_at");

-- CreateIndex
CREATE INDEX "appeals_user_id_created_at_idx" ON "appeals"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "appeals_kind_status_idx" ON "appeals"("kind", "status");

-- CreateIndex
CREATE INDEX "live_sessions_status_started_at_idx" ON "live_sessions"("status", "started_at");

-- CreateIndex
CREATE INDEX "live_sessions_host_id_created_at_idx" ON "live_sessions"("host_id", "created_at");

-- CreateIndex
CREATE INDEX "safety_incidents_status_severity_created_at_idx" ON "safety_incidents"("status", "severity", "created_at");

-- CreateIndex
CREATE INDEX "safety_incidents_user_id_idx" ON "safety_incidents"("user_id");

-- CreateIndex
CREATE INDEX "user_notes_user_id_created_at_idx" ON "user_notes"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_pages" ADD CONSTRAINT "business_pages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_pages" ADD CONSTRAINT "business_pages_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_pages" ADD CONSTRAINT "business_pages_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_follows" ADD CONSTRAINT "business_follows_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "business_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_follows" ADD CONSTRAINT "business_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_offers" ADD CONSTRAINT "business_offers_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "business_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_business_page_id_fkey" FOREIGN KEY ("business_page_id") REFERENCES "business_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_business_page_id_fkey" FOREIGN KEY ("business_page_id") REFERENCES "business_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_boost_post_id_fkey" FOREIGN KEY ("boost_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_boost_reel_id_fkey" FOREIGN KEY ("boost_reel_id") REFERENCES "reels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "ad_daily_stats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_business_page_id_fkey" FOREIGN KEY ("business_page_id") REFERENCES "business_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_music_track_id_fkey" FOREIGN KEY ("music_track_id") REFERENCES "music_tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_reused_audio_id_fkey" FOREIGN KEY ("reused_audio_id") REFERENCES "original_audios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_clips" ADD CONSTRAINT "reel_clips_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_clips" ADD CONSTRAINT "reel_clips_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "original_audios" ADD CONSTRAINT "original_audios_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "original_audios" ADD CONSTRAINT "original_audios_source_reel_id_fkey" FOREIGN KEY ("source_reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saves" ADD CONSTRAINT "saves_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_up_tokens" ADD CONSTRAINT "step_up_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_licences" ADD CONSTRAINT "music_licences_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "music_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_licences" ADD CONSTRAINT "music_licences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_suspended_by_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_cycles" ADD CONSTRAINT "reward_cycles_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "reach_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "reward_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "payout_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_hold_journal_id_fkey" FOREIGN KEY ("hold_journal_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_settle_journal_id_fkey" FOREIGN KEY ("settle_journal_id") REFERENCES "ledger_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_approvals" ADD CONSTRAINT "payout_approvals_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_approvals" ADD CONSTRAINT "payout_approvals_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_reviews" ADD CONSTRAINT "kyc_reviews_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_reviews" ADD CONSTRAINT "kyc_reviews_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_events" ADD CONSTRAINT "reach_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_events" ADD CONSTRAINT "reach_events_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_events" ADD CONSTRAINT "reach_events_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_config_versions" ADD CONSTRAINT "reach_config_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_scores" ADD CONSTRAINT "reach_scores_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_scores" ADD CONSTRAINT "reach_scores_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reach_scores" ADD CONSTRAINT "reach_scores_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "reach_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "moderation_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_moderation_action_id_fkey" FOREIGN KEY ("moderation_action_id") REFERENCES "moderation_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_terminated_by_id_fkey" FOREIGN KEY ("terminated_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

