-- Optional explicit start time ("HH:mm", 24h) for a slot. When NULL the API
-- parses the time from the slot label, so existing slots keep working.
ALTER TABLE "SlotConfiguration" ADD COLUMN "startTime" TEXT;
