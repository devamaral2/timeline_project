-- Reverte 0011: remove as chaves de dispositivo.
DROP TABLE IF EXISTS device_keys;

UPDATE auth_schema_meta SET version = 7, updated_at = now() WHERE singleton = true;
