-- snapshot-weekly-review.sql
-- Purpose: weekly operations review for snapshot_reason_daily_metrics (JST-based date bucket)
-- Usage example:
--   psql "$env:DATABASE_URL" -f backend/scripts/snapshot-weekly-review.sql

-- 1) Daily trend for last 7 JST days (primary reasons only)
SELECT
  metric_date::date AS metric_date_jst,
  source_name,
  reason_code,
  count
FROM snapshot_reason_daily_metrics
WHERE
  metric_date::date >= ((now() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '6 day')
  AND reason_code IN (
    'open_but_stale',
    'freshness_invalid',
    'freshness_expired',
    'candidate_unknown'
  )
ORDER BY metric_date_jst, source_name, reason_code;

-- 2) Week-over-week summary (last 7 days vs previous 7 days)
WITH base AS (
  SELECT
    metric_date::date AS metric_date_jst,
    source_name,
    reason_code,
    count
  FROM snapshot_reason_daily_metrics
  WHERE reason_code IN (
    'open_but_stale',
    'freshness_invalid',
    'freshness_expired',
    'candidate_unknown'
  )
),
current_7d AS (
  SELECT source_name, reason_code, SUM(count) AS current_7d_count
  FROM base
  WHERE metric_date_jst BETWEEN ((now() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '6 day')
                           AND  (now() AT TIME ZONE 'Asia/Tokyo')::date
  GROUP BY source_name, reason_code
),
previous_7d AS (
  SELECT source_name, reason_code, SUM(count) AS previous_7d_count
  FROM base
  WHERE metric_date_jst BETWEEN ((now() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '13 day')
                           AND ((now() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '7 day')
  GROUP BY source_name, reason_code
)
SELECT
  COALESCE(c.source_name, p.source_name) AS source_name,
  COALESCE(c.reason_code, p.reason_code) AS reason_code,
  COALESCE(c.current_7d_count, 0) AS current_7d_count,
  COALESCE(p.previous_7d_count, 0) AS previous_7d_count,
  (COALESCE(c.current_7d_count, 0) - COALESCE(p.previous_7d_count, 0)) AS wow_delta
FROM current_7d c
FULL OUTER JOIN previous_7d p
  ON c.source_name = p.source_name
 AND c.reason_code = p.reason_code
ORDER BY source_name, reason_code;

-- 3) Threshold reach ratio over last 7 days
-- Keep these threshold constants aligned with runtime env for reviewed environment.
WITH threshold(reason_code, threshold) AS (
  VALUES
    ('open_but_stale'::text, 20::int),
    ('freshness_invalid'::text, 5::int),
    ('freshness_expired'::text, 10::int),
    ('candidate_unknown'::text, 30::int)
),
daily AS (
  SELECT
    metric_date::date AS metric_date_jst,
    source_name,
    reason_code,
    count
  FROM snapshot_reason_daily_metrics
  WHERE
    metric_date::date >= ((now() AT TIME ZONE 'Asia/Tokyo')::date - INTERVAL '6 day')
    AND reason_code IN (
      'open_but_stale',
      'freshness_invalid',
      'freshness_expired',
      'candidate_unknown'
    )
)
SELECT
  d.source_name,
  d.reason_code,
  t.threshold,
  SUM(CASE WHEN d.count >= t.threshold AND t.threshold > 0 THEN 1 ELSE 0 END) AS days_over_threshold,
  COUNT(*) AS observed_days
FROM daily d
JOIN threshold t ON t.reason_code = d.reason_code
GROUP BY d.source_name, d.reason_code, t.threshold
ORDER BY d.source_name, d.reason_code;
