-- A track starts as a draft before its audio is uploaded, so its length cannot be positive yet.
-- What matters is that nothing *live* is missing its audio: that is enforced here, not only in code.
ALTER TABLE music_tracks
  DROP CONSTRAINT music_tracks_duration_positive,
  ADD CONSTRAINT music_tracks_duration_valid CHECK (duration_ms >= 0),
  ADD CONSTRAINT music_tracks_active_complete
    CHECK (status <> 'ACTIVE'
           OR (duration_ms > 0 AND audio_key IS NOT NULL AND preview_key IS NOT NULL));
