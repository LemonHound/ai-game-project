const request = require('supertest');
const app = require('../../src/backend/server');

describe('API Endpoints', () => {
    describe('GET /api/game/state', () => {
        it('should return game state', async () => {
            const response = await request(app)
                .get('/api/game/state')
                .expect(200);

            expect(response.body).toHaveProperty('gameId');
            expect(response.body).toHaveProperty('status');
        });
    });

    describe('POST /api/ai/move', () => {
        it('should return AI move', async () => {
            const response = await request(app)
                .post('/api/ai/move')
                .send({ gameState: { board: {} } })
                .expect(200);

            expect(response.body).toHaveProperty('ai_move');
        });
    });
});