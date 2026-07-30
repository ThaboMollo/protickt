-- Add an optional end time to events so organizers can advertise when the
-- event wraps up, not just when it starts. Nullable: existing events (and any
-- event without a defined end) simply leave it blank. The check keeps the
-- window sane — an end, when set, must come after the start.
alter table events
  add column ends_at timestamptz
  check (ends_at is null or ends_at > starts_at);
