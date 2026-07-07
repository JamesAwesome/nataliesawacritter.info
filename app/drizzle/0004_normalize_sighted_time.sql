-- Legacy rows stored the display string ('3:08 PM'); the app now stores sortable
-- 24h ('15:08') and formats at display. Normalize existing AM/PM values so they
-- sort correctly. Leaves NULL, 'just now', 'dusk', and already-24h values untouched.
UPDATE "sightings"
SET "sighted_time" = to_char(to_timestamp("sighted_time", 'HH12:MI AM'), 'HH24:MI')
WHERE "sighted_time" ~* '^\d{1,2}:\d{2} (AM|PM)$';
