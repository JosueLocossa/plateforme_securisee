require('./setup');
const request = require('supertest');
const pool    = require('../src/config/db');
const { seedPasswords, login, authHeader, app } = require('./helpers');

beforeAll(async () => {
  await seedPasswords();
});

describe('RBAC — Permissions par rôle', () => {
  let admin, marie, anne, paul, josue;

  beforeEach(async () => {
    // Login tous les acteurs avant chaque test
    admin = await login('admin@fsaip.fr');
    marie = await login('marie.scolarite@fsaip.fr');
    anne  = await login('anne.scolarite@fsaip.fr');
    paul  = await login('paul.compta@fsaip.fr');
    josue = await login('josue.etudiant@fsaip.fr');
  });

  // ─── Création de demande ───────────────────────
  describe('Création de demande — POST /api/requests', () => {
    test('Administration peut créer une demande', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set(authHeader(marie.token))
        .send({
          destinataire_id: josue.user.id,
          type_demande: 'upload_simple',
          titre: 'Test création',
        });

      expect(res.status).toBe(201);
      expect(res.body.demande.titre).toBe('Test création');
    });

    test('Étudiant ne peut PAS créer une demande → 403', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set(authHeader(josue.token))
        .send({
          destinataire_id: marie.user.id,
          type_demande: 'upload_simple',
          titre: 'Tentative interdite',
        });

      expect(res.status).toBe(403);
    });

    test('Admin ne peut PAS créer une demande → 403', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set(authHeader(admin.token))
        .send({
          destinataire_id: josue.user.id,
          type_demande: 'upload_simple',
          titre: 'Tentative admin',
        });

      expect(res.status).toBe(403);
    });
  });

  // ─── Visibilité par service ────────────────────
  describe('Visibilité — GET /api/requests', () => {
    let demandeScolariteId;

    beforeEach(async () => {
      // Marie (Scolarité) crée une demande pour Josué
      const res = await request(app)
        .post('/api/requests')
        .set(authHeader(marie.token))
        .send({
          destinataire_id: josue.user.id,
          type_demande: 'upload_simple',
          titre: 'Demande Scolarité',
        });
      demandeScolariteId = res.body.demande.id;
    });

    test('Anne (Scolarité) voit la demande de Marie (continuité de service)', async () => {
      const res = await request(app)
        .get('/api/requests')
        .set(authHeader(anne.token));

      expect(res.status).toBe(200);
      expect(res.body.demandes).toHaveLength(1);
      expect(res.body.demandes[0].id).toBe(demandeScolariteId);
    });

    test('Paul (Comptabilité) ne voit PAS la demande de Scolarité 🛡️', async () => {
      const res = await request(app)
        .get('/api/requests')
        .set(authHeader(paul.token));

      expect(res.status).toBe(200);
      expect(res.body.demandes).toHaveLength(0);
    });

    test('Josué (destinataire) voit la demande qui lui est adressée', async () => {
      const res = await request(app)
        .get('/api/requests')
        .set(authHeader(josue.token));

      expect(res.status).toBe(200);
      expect(res.body.demandes).toHaveLength(1);
    });

    test('Admin voit TOUTES les demandes (audit)', async () => {
      const res = await request(app)
        .get('/api/requests')
        .set(authHeader(admin.token));

      expect(res.status).toBe(200);
      expect(res.body.demandes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Upload : qui peut ? ───────────────────────
  describe('Upload — POST /api/documents/upload', () => {
    test('Admin ne peut PAS uploader → 403', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .set(authHeader(admin.token))
        .attach('fichier', Buffer.from('%PDF-1.4 fake'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(403);
    });

    test('Étudiant doit fournir un demande_id pour uploader → 400 sans', async () => {
      const res = await request(app)
        .post('/api/documents/upload')
        .set(authHeader(josue.token))
        .attach('fichier', Buffer.from('%PDF-1.4 fake'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
    });

    test('Étudiant ne peut PAS répondre à une demande qui n\'est pas la sienne → 403', async () => {
      // Marie crée une demande pour... Marie elle-même n'est pas possible
      // On va créer une demande pour le prof
      const prof = await login('professeur@fsaip.fr');
      const demandeRes = await request(app)
        .post('/api/requests')
        .set(authHeader(marie.token))
        .send({
          destinataire_id: prof.user.id,
          type_demande: 'upload_simple',
          titre: 'Demande pour prof',
        });

      const demandeId = demandeRes.body.demande.id;

      // Josué tente de répondre à la demande du prof
      const res = await request(app)
        .post('/api/documents/upload')
        .set(authHeader(josue.token))
        .field('demande_id', demandeId)
        .attach('fichier', Buffer.from('%PDF-1.4 fake'), {
          filename: 'test.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(403);
    });
  });

  // ─── Download : qui peut ? ─────────────────────
  describe('Download — GET /api/documents/:id/download', () => {
    test('Admin ne peut PAS télécharger → 403 (confidentialité) 🛡️', async () => {
      // On crée un doc factice en BDD (sans vraiment l'uploader)
      const docRes = await pool.query(
        `INSERT INTO documents (nom_fichier, type, taille_octets, chemin_nas, chiffre, uploader_id, uuid_fichier, iv, auth_tag, algorithme)
         VALUES ('test.pdf', 'application/pdf', 100, '/tmp/fake', true, $1, 'fake-uuid', 'fake-iv', 'fake-tag', 'aes-256-gcm')
         RETURNING id`,
        [josue.user.id]
      );
      const docId = docRes.rows[0].id;

      const res = await request(app)
        .get(`/api/documents/${docId}/download`)
        .set(authHeader(admin.token));

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/confidentialité/i);
    });
  });

  // ─── Suppression de document ───────────────────
  describe('Suppression — DELETE /api/documents/:id', () => {
    test('Seul l\'admin peut supprimer un document', async () => {
      // Marie ne doit pas pouvoir
      const docRes = await pool.query(
        `INSERT INTO documents (nom_fichier, type, taille_octets, chemin_nas, chiffre, uploader_id, uuid_fichier, iv, auth_tag, algorithme)
         VALUES ('test.pdf', 'application/pdf', 100, '/tmp/fake', true, $1, 'fake-uuid', 'fake-iv', 'fake-tag', 'aes-256-gcm')
         RETURNING id`,
        [josue.user.id]
      );
      const docId = docRes.rows[0].id;

      const res = await request(app)
        .delete(`/api/documents/${docId}`)
        .set(authHeader(marie.token));

      expect(res.status).toBe(403);
    });
  });
});
