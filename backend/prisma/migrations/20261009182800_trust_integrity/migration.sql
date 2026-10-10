-- Rules for the trust-and-safety tables that Prisma cannot express. They are the last line of
-- defence: the services check the same things first and give a friendly answer.

-- One person has at most one open report about the same thing for the same reason. Two taps, or two
-- devices, cannot both create one. (A report that has been dealt with does not block a new one.)
CREATE UNIQUE INDEX reports_one_open_per_reporter
  ON reports (reporter_id, target_type, target_id, category)
  WHERE reporter_id IS NOT NULL AND status IN ('OPEN', 'IN_REVIEW', 'ESCALATED');

-- A report is finished exactly when it has a finish time.
ALTER TABLE reports
  ADD CONSTRAINT reports_finished_has_time
    CHECK ((status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL)),
  ADD CONSTRAINT reports_priority_range CHECK (priority >= 0 AND priority <= 1000);

-- A decision cannot reverse itself.
ALTER TABLE moderation_actions
  ADD CONSTRAINT moderation_actions_no_self_reversal
    CHECK (reversal_of_id IS NULL OR reversal_of_id <> id);

-- An appeal is decided exactly when it has a decision time, and the person who decided it cannot be
-- the person who made the decision being appealed (nor the one who picked it up for review).
ALTER TABLE appeals
  ADD CONSTRAINT appeals_decided_has_time
    CHECK ((status IN ('UPHELD', 'OVERTURNED', 'REJECTED')) = (decided_at IS NOT NULL));

CREATE FUNCTION appeals_separation_of_duties() RETURNS trigger AS $$
BEGIN
  IF NEW.moderation_action_id IS NOT NULL
     AND (NEW.decided_by_id IS NOT NULL OR NEW.assigned_to_id IS NOT NULL)
     AND EXISTS (
       SELECT 1 FROM moderation_actions a
       WHERE a.id = NEW.moderation_action_id
         AND a.admin_id IS NOT NULL
         AND (a.admin_id = NEW.decided_by_id OR a.admin_id = NEW.assigned_to_id)
     )
  THEN
    RAISE EXCEPTION 'an appeal cannot be reviewed by the person who made the decision'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appeals_separation_of_duties
  BEFORE INSERT OR UPDATE OF assigned_to_id, decided_by_id, moderation_action_id ON appeals
  FOR EACH ROW EXECUTE FUNCTION appeals_separation_of_duties();

-- An incident that is resolved says when.
ALTER TABLE safety_incidents
  ADD CONSTRAINT safety_incidents_resolved_has_time
    CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL));

-- A live session that has ended says when, and a terminated one says who and why it was ended.
ALTER TABLE live_sessions
  ADD CONSTRAINT live_sessions_ended_has_time
    CHECK ((status IN ('ENDED', 'TERMINATED')) = (ended_at IS NOT NULL)),
  ADD CONSTRAINT live_sessions_terminated_has_reason
    CHECK (status <> 'TERMINATED' OR termination_reason IS NOT NULL),
  ADD CONSTRAINT live_sessions_viewers_nonnegative CHECK (peak_viewers >= 0);
