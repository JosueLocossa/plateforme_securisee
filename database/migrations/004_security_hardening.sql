-- ============================================================
-- 004_security_hardening.sql — Renforcement sécurité (Vague 1)
-- ============================================================

-- Préparer bcrypt sur utilisateurs
ALTER TABLE utilisateurs
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- AES-256-GCM nécessite IV + auth_tag stockés à part
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS iv VARCHAR(32),
    ADD COLUMN IF NOT EXISTS auth_tag VARCHAR(32),
    ADD COLUMN IF NOT EXISTS algorithme VARCHAR(50) DEFAULT 'aes-256-gcm',
    ADD COLUMN IF NOT EXISTS uuid_fichier VARCHAR(64);

-- Audit log structuré (Winston JSON + hash chaîné)
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS event VARCHAR(100),
    ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'INFO',
    ADD COLUMN IF NOT EXISTS result VARCHAR(20),
    ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS current_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_level ON audit_log(level);
CREATE INDEX IF NOT EXISTS idx_documents_uuid ON documents(uuid_fichier);