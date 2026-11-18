-- Already applied to the Zara Gaming Cloud D1 database on 2026-11-18.
-- Idempotent recovery migration for future Cloudflare Worker deployments.
CREATE TABLE IF NOT EXISTS youtube_scheduled_uploads (
    media_sha256 TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    youtube_id TEXT UNIQUE,
    publish_at_utc TEXT NOT NULL,
    upload_state TEXT NOT NULL CHECK (upload_state IN ('reserved','scheduled')),
    thumbnail_set INTEGER NOT NULL DEFAULT 0 CHECK (thumbnail_set IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_youtube_scheduled_job ON youtube_scheduled_uploads(job_id);
