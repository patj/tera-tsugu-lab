-- 同じ施設の pending と confirmed の予約の時間が重ならないようにする（spec.md §6）。
-- Drizzle の push では作れないので、push のあとに scripts/apply-sql.ts が流す。何度流してもよい形にする。
-- 端がちょうど接する予約（10:00〜11:00 と 11:00〜12:00）は重ならないとみなす（tstzrange は既定で [start, end)）。
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    facility_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_time_order;
ALTER TABLE reservations ADD CONSTRAINT reservations_time_order CHECK (start_at < end_at);
