ALTER TABLE public.clases
  ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '🏫';

ALTER TABLE public.clases
  DROP CONSTRAINT IF EXISTS clases_emoji_length;

ALTER TABLE public.clases
  ADD CONSTRAINT clases_emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 12);
