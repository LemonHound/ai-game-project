import { useCallback, useState } from 'react';

interface DotsAndBoxesBoardProps {
    gridSize: number;
    horizontalLines: Record<string, 'player' | 'ai'>;
    verticalLines: Record<string, 'player' | 'ai'>;
    boxes: Record<string, 'player' | 'ai'>;
    currentTurn: 'player' | 'ai' | null;
    locked: boolean;
    lastLine: { type: 'h' | 'v'; row: number; col: number } | null;
    onLineClick: (type: 'horizontal' | 'vertical', row: number, col: number) => void;
    hidePieces?: boolean;
}

const CELL = 80;
const PADDING = 24;
const DOT_RADIUS = 5;
const LINE_STROKE = 4;
const HIT_SIZE = 20;

const PLAYER_COLOR = '#3B82F6';
const AI_COLOR = '#EF4444';
const UNDRAWN_COLOR = '#6B7280';
const HOVER_COLOR = '#A3BFFA';
const PLAYER_FILL = 'rgba(59, 130, 246, 0.35)';
const AI_FILL = 'rgba(239, 68, 68, 0.35)';

const LAST_LINE_COLOR = '#FBBF24';

/**
 * Renders the interactive Dots and Boxes board with line drawing and claimed-box highlights.
 */
export default function DotsAndBoxesBoard({
    gridSize,
    horizontalLines,
    verticalLines,
    boxes,
    locked,
    lastLine,
    onLineClick,
    hidePieces = false,
}: DotsAndBoxesBoardProps) {
    const [hoveredLine, setHoveredLine] = useState<string | null>(null);

    const svgSize = gridSize * CELL + PADDING * 2;

    const cx = (col: number) => PADDING + col * CELL;
    const cy = (row: number) => PADDING + row * CELL;

    const handleLineEnter = useCallback((key: string) => {
        setHoveredLine(key);
    }, []);

    const handleLineLeave = useCallback(() => {
        setHoveredLine(null);
    }, []);

    const handleLineClick = useCallback(
        (type: 'horizontal' | 'vertical', row: number, col: number) => {
            onLineClick(type, row, col);
        },
        [onLineClick]
    );

    const dots: React.ReactNode[] = [];
    for (let r = 0; r <= gridSize; r++) {
        for (let c = 0; c <= gridSize; c++) {
            dots.push(<circle key={`dot-${r}-${c}`} cx={cx(c)} cy={cy(r)} r={DOT_RADIUS} fill='#9CA3AF' />);
        }
    }

    const boxFills: React.ReactNode[] = [];
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const owner = boxes[`${r},${c}`];
            if (!owner) continue;
            const bx = cx(c) + DOT_RADIUS;
            const by = cy(r) + DOT_RADIUS;
            const bw = CELL - DOT_RADIUS * 2;
            const bh = CELL - DOT_RADIUS * 2;
            const iconCx = cx(c) + CELL / 2;
            const iconCy = cy(r) + CELL / 2;
            boxFills.push(
                <g key={`box-${r}-${c}`}>
                    <rect x={bx} y={by} width={bw} height={bh} fill={owner === 'player' ? PLAYER_FILL : AI_FILL} />
                    {owner === 'player' ? (
                        <text
                            x={iconCx}
                            y={iconCy + 6}
                            textAnchor='middle'
                            fontSize={22}
                            fontWeight='bold'
                            fill={PLAYER_COLOR}
                            opacity={0.7}>
                            P
                        </text>
                    ) : (
                        <g transform={`translate(${iconCx - 10}, ${iconCy - 10})`} opacity={0.7}>
                            <rect x={2} y={4} width={16} height={12} rx={3} fill={AI_COLOR} />
                            <rect x={6} y={0} width={8} height={5} rx={1} fill={AI_COLOR} />
                            <circle cx={6} cy={10} r={2} fill='white' />
                            <circle cx={14} cy={10} r={2} fill='white' />
                            <rect x={0} y={9} width={2} height={5} rx={1} fill={AI_COLOR} />
                            <rect x={18} y={9} width={2} height={5} rx={1} fill={AI_COLOR} />
                        </g>
                    )}
                </g>
            );
        }
    }

    const horizontalLineElements: React.ReactNode[] = [];
    for (let r = 0; r <= gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const key = `${r},${c}`;
            const owner = horizontalLines[key];
            const isDrawn = !hidePieces && !!owner;
            const hoverKey = `h-${key}`;
            const isHovered = hoveredLine === hoverKey;
            const isClickable = !locked && !isDrawn;

            const isLastLine = !hidePieces && lastLine?.type === 'h' && lastLine.row === r && lastLine.col === c;

            let stroke = UNDRAWN_COLOR;
            if (isLastLine) {
                stroke = LAST_LINE_COLOR;
            } else if (isDrawn) {
                stroke = owner === 'player' ? PLAYER_COLOR : AI_COLOR;
            } else if (isHovered) {
                stroke = HOVER_COLOR;
            }

            const x1 = cx(c) + DOT_RADIUS;
            const x2 = cx(c + 1) - DOT_RADIUS;
            const y = cy(r);

            horizontalLineElements.push(
                <g key={`hline-${r}-${c}`}>
                    <line
                        x1={x1}
                        y1={y}
                        x2={x2}
                        y2={y}
                        stroke={stroke}
                        strokeWidth={LINE_STROKE}
                        strokeDasharray={isDrawn ? undefined : '6 4'}
                        strokeLinecap='round'
                    />
                    {isClickable && (
                        <rect
                            x={x1}
                            y={y - HIT_SIZE / 2}
                            width={x2 - x1}
                            height={HIT_SIZE}
                            fill='transparent'
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={() => handleLineEnter(hoverKey)}
                            onMouseLeave={handleLineLeave}
                            onClick={() => handleLineClick('horizontal', r, c)}
                        />
                    )}
                </g>
            );
        }
    }

    const verticalLineElements: React.ReactNode[] = [];
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c <= gridSize; c++) {
            const key = `${r},${c}`;
            const owner = verticalLines[key];
            const isDrawn = !hidePieces && !!owner;
            const hoverKey = `v-${key}`;
            const isHovered = hoveredLine === hoverKey;
            const isClickable = !locked && !isDrawn;

            const isLastLine = !hidePieces && lastLine?.type === 'v' && lastLine.row === r && lastLine.col === c;

            let stroke = UNDRAWN_COLOR;
            if (isLastLine) {
                stroke = LAST_LINE_COLOR;
            } else if (isDrawn) {
                stroke = owner === 'player' ? PLAYER_COLOR : AI_COLOR;
            } else if (isHovered) {
                stroke = HOVER_COLOR;
            }

            const x = cx(c);
            const y1 = cy(r) + DOT_RADIUS;
            const y2 = cy(r + 1) - DOT_RADIUS;

            verticalLineElements.push(
                <g key={`vline-${r}-${c}`}>
                    <line
                        x1={x}
                        y1={y1}
                        x2={x}
                        y2={y2}
                        stroke={stroke}
                        strokeWidth={LINE_STROKE}
                        strokeDasharray={isDrawn ? undefined : '6 4'}
                        strokeLinecap='round'
                    />
                    {isClickable && (
                        <rect
                            x={x - HIT_SIZE / 2}
                            y={y1}
                            width={HIT_SIZE}
                            height={y2 - y1}
                            fill='transparent'
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={() => handleLineEnter(hoverKey)}
                            onMouseLeave={handleLineLeave}
                            onClick={() => handleLineClick('vertical', r, c)}
                        />
                    )}
                </g>
            );
        }
    }

    return (
        <svg
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            width='100%'
            style={{ display: 'block', maxWidth: svgSize }}
            aria-label='Dots and Boxes board'>
            {!hidePieces && boxFills}
            {horizontalLineElements}
            {verticalLineElements}
            {dots}
        </svg>
    );
}
