import { useEffect, useRef, useState } from 'react';
import { parseInfo } from '../lib/uci';
import { normalizeToWhite, type WhiteScore } from '../lib/evalScore';
import { createStockfishEngine, type UciEngine } from '../lib/stockfishEngine';

export interface EvalState extends WhiteScore {
    depth: number;
    ready: boolean;
}

const MOVETIME_MS = 500;

export const useStockfishEval = (
    fen: string | null,
    engineFactory: () => UciEngine = createStockfishEngine
): EvalState => {
    const [state, setState] = useState<EvalState>({ cp: null, mate: null, depth: 0, ready: false });
    const engineRef = useRef<UciEngine | null>(null);
    const sideRef = useRef<'w' | 'b'>('w');

    useEffect(() => {
        const engine = engineFactory();
        engineRef.current = engine;
        engine.onLine(line => {
            if (line.includes('uciok')) {
                setState(s => ({ ...s, ready: true }));
                return;
            }
            const info = parseInfo(line);
            if (!info) return;
            const white = normalizeToWhite(info, sideRef.current);
            setState(s => ({ ...s, cp: white.cp, mate: white.mate, depth: info.depth }));
        });
        engine.post('uci');
        return () => {
            engine.terminate();
            engineRef.current = null;
        };
    }, [engineFactory]);

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !fen) return;
        sideRef.current = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        setState(s => ({ ...s, cp: null, mate: null, depth: 0 }));
        engine.post('stop');
        engine.post(`position fen ${fen}`);
        engine.post(`go movetime ${MOVETIME_MS}`);
    }, [fen]);

    return state;
};
