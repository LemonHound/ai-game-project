import { afterEach, describe, expect, it, vi } from 'vitest';
import { chessNewGame, fetchChessEngines } from './chess';

afterEach(() => vi.restoreAllMocks());

describe('chess engines api', () => {
    it('fetchChessEngines returns the engines array', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ engines: [{ difficulty: 'cnn', versions: [] }] }),
            }))
        );
        const engines = await fetchChessEngines();
        expect(engines).toEqual([{ difficulty: 'cnn', versions: [] }]);
    });

    it('chessNewGame sends engine_version_id', async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'x', state: {} }) }));
        vi.stubGlobal('fetch', fetchMock);
        await chessNewGame(true, 7);
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body).toMatchObject({ player_starts: true, engine_version_id: 7 });
    });
});
