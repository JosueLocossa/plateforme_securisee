-- ============================================================
-- 005_module_demandes.sql — Module de demandes + services
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. NETTOYAGE PRÉALABLE
-- ────────────────────────────────────────────────────────────

-- Supprimer la table 'demandes' ancienne (vide, jamais utilisée)
DROP TABLE IF EXISTS demandes CASCADE;

-- Supprimer les utilisateurs avec rôle 'invite' (jamais utilisé)
DELETE FROM utilisateurs WHERE role = 'invite';

-- ────────────────────────────────────────────────────────────
-- 2. TABLE SERVICES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO services (nom, description) VALUES
    ('Scolarité',    'Gestion académique des étudiants'),
    ('Comptabilité', 'Finance, paies, factures')
ON CONFLICT (nom) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. METTRE À JOUR LA CONTRAINTE DE RÔLES
-- ────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs
    DROP CONSTRAINT IF EXISTS utilisateurs_role_check;

ALTER TABLE utilisateurs
    ADD CONSTRAINT utilisateurs_role_check
    CHECK (role IN ('admin', 'administration', 'etudiant_interne', 'prof', 'externe',
                    'scolaire'));
    -- 'scolaire' temporaire pour ne pas casser les anciens utilisateurs avant UPDATE

-- ────────────────────────────────────────────────────────────
-- 4. AJOUTER service_id SUR utilisateurs
-- ────────────────────────────────────────────────────────────
ALTER TABLE utilisateurs
    ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id);

CREATE INDEX IF NOT EXISTS idx_utilisateurs_service ON utilisateurs(service_id);

-- ────────────────────────────────────────────────────────────
-- 5. MIGRATION DES UTILISATEURS EXISTANTS + NOUVEAUX
-- ────────────────────────────────────────────────────────────

-- L'ancien admin reste admin
UPDATE utilisateurs SET prenom = 'Admin', nom = 'Demo'
WHERE email = 'admin@fsaip.fr';

-- L'ancien 'prof' (qui était en fait l'administration) devient un agent de Scolarité
UPDATE utilisateurs
SET role = 'administration',
    email = 'marie.scolarite@fsaip.fr',
    prenom = 'Marie',
    nom = 'Dupont',
    service_id = (SELECT id FROM services WHERE nom = 'Scolarité')
WHERE email = 'prof@fsaip.fr';

-- L'ancien 'eleve' (scolaire) devient un étudiant interne
UPDATE utilisateurs
SET role = 'etudiant_interne',
    email = 'josue.etudiant@fsaip.fr',
    prenom = 'Josué',
    nom = 'Locossa'
WHERE email = 'eleve@fsaip.fr';

-- Ajouter les nouveaux utilisateurs de test
INSERT INTO utilisateurs (email, prenom, nom, role, service_id) VALUES
    -- 2e agent Scolarité (pour démontrer la collaboration intra-service)
    ('anne.scolarite@fsaip.fr', 'Anne',   'Martin',
     'administration',
     (SELECT id FROM services WHERE nom = 'Scolarité')),

    -- 2 agents Comptabilité
    ('paul.compta@fsaip.fr',    'Paul',   'Bernard',
     'administration',
     (SELECT id FROM services WHERE nom = 'Comptabilité')),

    ('sophie.compta@fsaip.fr',  'Sophie', 'Petit',
     'administration',
     (SELECT id FROM services WHERE nom = 'Comptabilité')),

    -- Prof (utilisateur final, pas admin)
    ('professeur@fsaip.fr',     'Sophie', 'Durand',
     'prof',
     NULL),

    -- Externe (candidat, partenaire...)
    ('externe@fsaip.fr',        'Lucas',  'Bernard',
     'externe',
     NULL)
ON CONFLICT (email) DO NOTHING;

-- Maintenant que tous les UPDATE sont passés, on peut retirer 'scolaire' du CHECK
ALTER TABLE utilisateurs
    DROP CONSTRAINT IF EXISTS utilisateurs_role_check;

ALTER TABLE utilisateurs
    ADD CONSTRAINT utilisateurs_role_check
    CHECK (role IN ('admin', 'administration', 'etudiant_interne', 'prof', 'externe'));

-- ────────────────────────────────────────────────────────────
-- 6. TABLE demandes_documents
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demandes_documents (
    id SERIAL PRIMARY KEY,

    -- Émetteur (administration uniquement)
    emetteur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE NOT NULL,
    service_id  INTEGER REFERENCES services(id),
        -- Snapshot du service au moment de la création

    -- Destinataire (etudiant_interne, prof, externe)
    destinataire_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE NOT NULL,

    -- Type
    type_demande VARCHAR(50) NOT NULL
        CHECK (type_demande IN ('upload_simple', 'remplir_document')),

    -- Métier
    titre VARCHAR(255) NOT NULL,
    description TEXT,

    -- Si remplir_document : document modèle fourni par l'émetteur
    document_modele_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,

    -- Workflow simplifié (juste 2 statuts)
    statut VARCHAR(50) DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'fait')),

    -- Dates
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_limite TIMESTAMP NOT NULL,   -- toujours +14 jours, géré côté API
    date_reponse TIMESTAMP            -- horodatage du 1er dépôt
);

CREATE INDEX IF NOT EXISTS idx_demandes_emetteur     ON demandes_documents(emetteur_id);
CREATE INDEX IF NOT EXISTS idx_demandes_service      ON demandes_documents(service_id);
CREATE INDEX IF NOT EXISTS idx_demandes_destinataire ON demandes_documents(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_demandes_statut       ON demandes_documents(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_date_limite  ON demandes_documents(date_limite);

-- ────────────────────────────────────────────────────────────
-- 7. TABLE notifications (in-app)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    destinataire_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) NOT NULL,
    titre VARCHAR(255) NOT NULL,
    message TEXT,
    lien_id   INTEGER,
    lien_type VARCHAR(50),
    lue BOOLEAN DEFAULT FALSE,
    cree_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_destinataire ON notifications(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_notifications_lue          ON notifications(lue);

-- ────────────────────────────────────────────────────────────
-- 8. LIER documents → demande
-- ────────────────────────────────────────────────────────────
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS demande_id INTEGER REFERENCES demandes_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_demande ON documents(demande_id);

-- ────────────────────────────────────────────────────────────
-- 9. VÉRIFICATION
-- ────────────────────────────────────────────────────────────
SELECT 'Migration 005 OK' AS resultat;