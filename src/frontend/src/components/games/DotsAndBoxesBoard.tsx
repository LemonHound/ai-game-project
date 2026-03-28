import { useCallback, useState } from 'react';

interface DotsAndBoxesBoardProps {
    gridSize: number;
    horizontalLines: Record<string, 'player' | 'ai'>;
    verticalLines: Record<string, 'player' | 'ai'>;
    boxes: Record<string, 'player' | 'ai'>;
    currentTurn: 'player' | 'ai' | null;
    locked: boolean;
    onLineClick: (type: 'horizontal' | 'vertical', row: number, col: number) => void;
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
const PLAYER_FILL = 'rgba(59, 130, 246, 0.25)';
const AI_FILL = 'rgba(239, 68, 68, 0.25)';

export default function DotsAndBoxesBoard({
    gridSize,
    horizontalLines,
    verticalLines,
    boxes,
    locked,
    onLineClick,
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
            boxFills.push(
                <rect
                    key={`box-${r}-${c}`}
                    x={cx(c) + DOT_RADIUS}
                    y={cy(r) + DOT_RADIUS}
                    width={CELL - DOT_RADIUS * 2}
                    height={CELL - DOT_RADIUS * 2}
                    fill={owner === 'player' ? PLAYER_FILL : AI_FILL}
                />
            );
        }
    }

    const horizontalLineElements: React.ReactNode[] = [];
    for (let r = 0; r <= gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            const key = `${r},${c}`;
            const owner = horizontalLines[key];
            const isDrawn = !!owner;
            const hoverKey = `h-${key}`;
            const isHovered = hoveredLine === hoverKey;
            const isClickable = !locked && !isDrawn;

            let stroke = UNDRAWN_COLOR;
            if (isDrawn) {
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
            const isDrawn = !!owner;
            const hoverKey = `v-${key}`;
            const isHovered = hoveredLine === hoverKey;
            const isClickable = !locked && !isDrawn;

            let stroke = UNDRAWN_COLOR;
            if (isDrawn) {
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
            {boxFills}
            {horizontalLineElements}
            {verticalLineElements}
            {dots}
        </svg>
    );
}
