-- Legacy migration marker.
-- Media assets were originally added as 0003_media_assets.sql.
-- Keep this file as a no-op so databases that already recorded 0003 keep their history.
-- Fresh deployments use 0008_media_assets.sql for the actual table creation.
SELECT 1;
