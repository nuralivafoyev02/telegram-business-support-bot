-- 021_system_messages_reactions.sql
-- Add action_type and reactions to messages table to store system events and reactions in a structured way.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS action_type text,
ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '[]'::jsonb;

-- Optional: Create an index on action_type if we frequently filter by it
CREATE INDEX IF NOT EXISTS idx_messages_action_type ON public.messages(action_type) WHERE action_type IS NOT NULL;
