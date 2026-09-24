-- Lead email alerts: where to send them, and a once-per-conversation delivery marker.
alter table obseri_published_souls
  add column if not exists lead_alert_email text;

alter table obseri_conversations
  add column if not exists lead_notified_at timestamptz;
