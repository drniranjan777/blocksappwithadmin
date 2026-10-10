-- Rules for business pages, verification and advertising that Prisma cannot express. The services
-- check the same things first and answer in plain words; these are the last line of defence.

-- A page address is lower-case letters, digits and hyphens, 3 to 40 characters, not starting or
-- ending with a hyphen. (The first version of this rule allowed a hyphen at either end.)
ALTER TABLE business_pages DROP CONSTRAINT business_pages_slug_format;
ALTER TABLE business_pages
  ADD CONSTRAINT business_pages_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  -- The encrypted registration number and its last four characters come together or not at all.
  ADD CONSTRAINT business_pages_gstin_pair
    CHECK ((gstin_enc IS NULL) = (gstin_last4 IS NULL));

-- A person has at most one request of a kind waiting for each page (or none, for a personal one).
CREATE UNIQUE INDEX verification_requests_one_pending
  ON verification_requests (user_id, type, COALESCE(business_page_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'PENDING';

-- A request is either waiting or decided, and a decision says when.
ALTER TABLE verification_requests
  ADD CONSTRAINT verification_requests_has_a_state CHECK (status <> 'NONE'),
  ADD CONSTRAINT verification_requests_decided_has_time
    CHECK ((status IN ('APPROVED', 'REJECTED')) = (reviewed_at IS NOT NULL));

-- The daily limit cannot be more than the whole budget. (A positive budget, the schedule and the
-- spend limit are already enforced by the base integrity migration.)
ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_daily_within_total
    CHECK (daily_budget IS NULL OR (daily_budget > 0 AND daily_budget <= budget_total)),
  -- Nothing is delivered until it has been paid for, whatever the application did.
  ADD CONSTRAINT ad_campaigns_active_is_paid
    CHECK (status <> 'ACTIVE' OR billing_status = 'PAID'),
  -- Nothing goes live, or has gone live, without a person having reviewed it.
  ADD CONSTRAINT ad_campaigns_reviewed_before_live
    CHECK (status NOT IN ('APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED') OR reviewed_at IS NOT NULL);
