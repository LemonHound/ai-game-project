export interface UciEngine {
    post(command: string): void;
    onLine(handler: (line: string) => void): void;
    terminate(): void;
}

const ENGINE_URL = '/engine/stockfish-nnue-16-single.js';

export const createStockfishEngine = (): UciEngine => {
    const worker = new Worker(ENGINE_URL);
    return {
        post: command => worker.postMessage(command),
        onLine: handler => {
            worker.onmessage = event => {
                const line = typeof event.data === 'string' ? event.data : String(event.data?.data ?? '');
                if (line) handler(line);
            };
        },
        terminate: () => worker.terminate(),
    };
};
