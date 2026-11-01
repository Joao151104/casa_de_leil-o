-- Número de catálogo do lote ("Lote 004"), sequencial como num catálogo impresso.
-- Lotes já existentes recebem números na ordem de criação.
ALTER TABLE lots ADD COLUMN number integer;
UPDATE lots SET number = n FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM lots) o WHERE lots.id = o.id;
CREATE SEQUENCE lots_number_seq OWNED BY lots.number;
SELECT setval('lots_number_seq', COALESCE((SELECT max(number) FROM lots), 0) + 1, false);
ALTER TABLE lots ALTER COLUMN number SET DEFAULT nextval('lots_number_seq'), ALTER COLUMN number SET NOT NULL;
CREATE UNIQUE INDEX lots_number_idx ON lots (number);
