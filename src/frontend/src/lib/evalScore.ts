import type { UciInfo } from './uci';

export interface WhiteScore {
    cp: number | null;
    mate: number | null;
}

export const normalizeToWhite = (info: UciInfo, sideToMove: 'w' | 'b'): WhiteScore => {
    const sign = sideToMove === 'w' ? 1 : -1;
    return {
        cp: info.scoreCp === null ? null : info.scoreCp * sign,
        mate: info.mate === null ? null : info.mate * sign,
    };
};

export const cpToWhiteFill = (cp: number): number => {
    const clamped = Math.max(-2000, Math.min(2000, cp));
    return 1 / (1 + Math.exp(-0.00368208 * clamped));
};

export const whiteFill = (score: WhiteScore): number => {
    if (score.mate !== null) return score.mate > 0 ? 1 : 0;
    if (score.cp !== null) return cpToWhiteFill(score.cp);
    return 0.5;
};

export const formatEval = (score: WhiteScore): string => {
    if (score.mate !== null) return `M${Math.abs(score.mate)}`;
    if (score.cp !== null) {
        const pawns = score.cp / 100;
        return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
    }
    return '0.0';
};
