-- ============================================================
-- 003_users_test.sql — Utilisateurs de test pour POC
-- ============================================================

INSERT INTO utilisateurs (email, nom, prenom, role) VALUES
    ('admin@fsaip.fr',   'Admin',   'Demo', 'admin'),
    ('prof@fsaip.fr',    'Martin',  'Pierre', 'prof'),
    ('eleve@fsaip.fr',   'Dupont',  'Marie',  'scolaire'),
    ('invite@fsaip.fr',  'Visiteur','Jean',   'invite')
ON CONFLICT (email) DO NOTHING;