ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
-- media_type will be 'image' or 'file' -- lets the frontend decide
-- whether to render an <img> or a download link.

ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
-- a message can now be JUST a file, with no text content