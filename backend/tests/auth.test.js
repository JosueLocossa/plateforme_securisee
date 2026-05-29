require('./setup'); // hook beforeEach + afterAll
const request = require('supertest');
const { seedPasswords, app } = require('./helpers');

beforeAll(async () => {
  await seedPasswords();
});

describe('Authentification', () => {
  // ─── Tests de login réussi ─────────────────────
  describe('POST /api/auth/login — Succès', () => {
    test('Login réussi pour admin', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@fsaip.fr', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        email: 'admin@fsaip.fr',
        role: 'admin',
      });
    });

    test('Login réussi pour administration avec service', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'marie.scolarite@fsaip.fr', password: 'marie123' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('administration');
      expect(res.body.user.service).toBe('Scolarité');
    });

    test('Login réussi pour étudiant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'josue.etudiant@fsaip.fr', password: 'josue123' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('etudiant_interne');
    });
  });

  // ─── Tests de login échec ──────────────────────
  describe('POST /api/auth/login — Échec', () => {
    test('Mauvais mot de passe → 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'marie.scolarite@fsaip.fr', password: 'mauvais' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Identifiants invalides');
    });

    test('Email inexistant → 401 (même message, anti énumération)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'hacker@example.com', password: 'whatever' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Identifiants invalides');
    });

    test('Email manquant → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'marie123' });

      expect(res.status).toBe(400);
    });

    test('Password manquant → 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'marie.scolarite@fsaip.fr' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Test anti timing attack ───────────────────
  describe('Sécurité — Anti timing attack', () => {
    test('Temps de réponse constant minimum (250ms)', async () => {
      const start = Date.now();
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'inexistant@example.com', password: 'whatever' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(250);
    });
  });

  // ─── Test endpoint protégé ─────────────────────
  describe('Endpoints protégés', () => {
    test('Sans token → 401', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
    });

    test('Avec token invalide → 401', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid_token_xxx');
      expect(res.status).toBe(401);
    });
  });
});
