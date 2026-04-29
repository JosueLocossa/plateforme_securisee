-- 001_init.sql — Schéma initial (français)

CREATE TABLE IF NOT EXISTS utilisateurs (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    nom VARCHAR(100),
    prenom VARCHAR(100),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'prof', 'scolaire', 'invite')),
    cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    nom_fichier VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    taille_octets BIGINT,
    chemin_nas TEXT NOT NULL,
    chiffre BOOLEAN DEFAULT TRUE,
    uploader_id INTEGER REFERENCES utilisateurs(id),
    role_requis VARCHAR(50),
    cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    utilisateur_id INTEGER REFERENCES utilisateurs(id),
    action VARCHAR(100) NOT NULL,
    type_ressource VARCHAR(50),
    ressource_id INTEGER,
    adresse_ip VARCHAR(45),
    details JSONB,
    cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE RULE audit_log_no_update AS
    ON UPDATE TO audit_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_log_no_delete AS
    ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_audit_utilisateur ON audit_log(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_audit_cree_le ON audit_log(cree_le);
CREATE INDEX IF NOT EXISTS idx_documents_uploader ON documents(uploader_id);

INSERT INTO utilisateurs (id, email, nom, prenom, role)
VALUES (1, 'admin@fsaip.fr', 'Admin', 'FSAIP', 'admin')
ON CONFLICT (email) DO NOTHING;