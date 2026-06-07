export interface UciInfo {
    depth: number;
    scoreCp: number | null;
    mate: number | null;
}

export const parseInfo = (line: string): UciInfo | null => {
    if (!line.startsWith('info ')) return null;
    const tokens = line.split(/\s+/);
    const depthIdx = tokens.indexOf('depth');
    const scoreIdx = tokens.indexOf('score');
    if (depthIdx === -1 || scoreIdx === -1) return null;
    const depth = Number(tokens[depthIdx + 1]);
    const kind = tokens[scoreIdx + 1];
    const value = Number(tokens[scoreIdx + 2]);
    if (Number.isNaN(depth) || Number.isNaN(value)) return null;
    if (kind === 'cp') return { depth, scoreCp: value, mate: null };
    if (kind === 'mate') return { depth, scoreCp: null, mate: value };
    return null;
};
