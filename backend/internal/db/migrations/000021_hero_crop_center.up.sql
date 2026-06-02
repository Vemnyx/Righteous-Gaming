ALTER TABLE heroes
    ADD COLUMN crop_center_x double precision,
    ADD COLUMN crop_center_y double precision;

-- Arakni, Huntsman — manual center from prior one-off fix
UPDATE heroes
SET crop_center_x = 0.50, crop_center_y = 0.44
WHERE id = 10;
