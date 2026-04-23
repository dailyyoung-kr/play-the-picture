-- Migration 010: dead column cleanup
-- entries.vibe_spectrum: 항상 null로 insert되던 죽은 컬럼 (읽는 코드 0개)
-- entries.mood: localStorage shape 불일치로 항상 null 박히던 컬럼 (admin select만 걸려있음)
-- preference_logs.mood: API route에서 insert하지 않아 항상 null이던 컬럼

ALTER TABLE entries DROP COLUMN IF EXISTS vibe_spectrum;
ALTER TABLE entries DROP COLUMN IF EXISTS mood;
ALTER TABLE preference_logs DROP COLUMN IF EXISTS mood;
