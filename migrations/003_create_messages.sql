CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    content TEXT NOT NULL,
    

    status VARCHAR(10) NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'delivered', 'read')),
    -- 'sent' / 'delivered' / 'read' -- this column is actually Level 3's
    -- read-receipt requirement, but it costs nothing to add the column
    -- now while we're already building the table.

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- We will constantly ask "give me the conversation between user A and
-- user B, most recent first" -- this composite index makes that fast.
CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver
    ON messages (receiver_id, created_at DESC);