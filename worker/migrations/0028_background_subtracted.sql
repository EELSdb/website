-- Whether the spectrum's main file is background subtracted: 1, 0, or NULL when not stated (every legacy spectrum).
ALTER TABLE treatment ADD COLUMN background_subtracted INTEGER;
