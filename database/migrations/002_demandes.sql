-- 002_demandes.sql — Module de demande de documents

CREATE TABLE IF NOT EXISTS demandes (
    id SERIAL PRIMARY KEY,
    demandeur_id INTEGER REFERENCES utilisateurs(id) NOT NULL,
    document_id INTEGER REFERENCES documents(id),
    motif TEXT NOT NULL,
    statut VARCHAR(50) DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'approuvee', 'refusee', 'expiree')),
    valideur_id INTEGER REFERENCES utilisateurs(id),
    commentaire_validation TEXT,
    date_demande TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_validation TIMESTAMP,
    date_expiration TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_demandes_demandeur ON demandes(demandeur_id);
CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes(statut);