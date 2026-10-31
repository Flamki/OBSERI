begin;
-- Nullable additive columns preserve existing analytics and mark old visits unknown.
alter table obseri_analytics_events add column if not exists country_code text;
alter table obseri_analytics_events add column if not exists device_type text;
alter table obseri_analytics_events add column if not exists browser_name text;
commit;
