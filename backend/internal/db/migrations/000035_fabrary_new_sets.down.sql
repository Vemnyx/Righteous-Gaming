DELETE FROM sets
WHERE code IN ('ama', 'amo', 'mpa', 'sat', 'sbw', 'spw');

UPDATE sets
SET name = 'IAR'
WHERE lower(code) = 'iar'
  AND name = 'Usurp the Shadow Throne';
