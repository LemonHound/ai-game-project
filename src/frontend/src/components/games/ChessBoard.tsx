import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ChessBoardProps {
    board: (string | null)[][];
    playerColor: 'white' | 'black';
    selectedSquare: [number, number] | null;
    legalDestinations: [number, number][];
    lastMove: { fromRow: number; fromCol: number; toRow: number; toCol: number; isCastling?: boolean } | null;
    inCheck: boolean;
    locked: boolean;
    onSquareClick: (row: number, col: number) => void;
    onSquareDrop: (row: number, col: number) => void;
    kingInCheckColor?: 'white' | 'black' | null;
    kingPositions?: { white: [number, number]; black: [number, number] } | null;
    hidePieces?: boolean;
}

const PIECE_IMAGES: Record<string, string> = {
    K: '/images/k_white.png',
    Q: '/images/q_white.png',
    R: '/images/r_white.png',
    B: '/images/b_white.png',
    N: '/images/n_white.png',
    P: '/images/p_white.png',
    k: '/images/k_black.png',
    q: '/images/q_black.png',
    r: '/images/r_black.png',
    b: '/images/b_black.png',
    n: '/images/n_black.png',
    p: '/images/p_black.png',
};

interface DragState {
    fromRow: number;
    fromCol: number;
    startX: number;
    startY: number;
    active: boolean;
    piece: string;
    size: number;
}

export default function ChessBoard({
    board,
    playerColor,
    selectedSquare,
    legalDestinations,
    lastMove,
    inCheck,
    locked,
    onSquareClick,
    onSquareDrop,
    kingInCheckColor,
    kingPositions,
    hidePieces = false,
}: ChessBoardProps) {
    const rows = playerColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = playerColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const [dragGhost, setDragGhost] = useState<{ x: number; y: number; piece: string; size: number } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const squareRefs = useRef<(HTMLDivElement | null)[][]>(Array.from({ length: 8 }, () => Array(8).fill(null)));
    const onSquareClickRef = useRef(onSquareClick);
    const onSquareDropRef = useRef(onSquareDrop);
    const lockedRef = useRef(locked);

    onSquareClickRef.current = onSquareClick;
    onSquareDropRef.current = onSquareDrop;
    lockedRef.current = locked;

    const getSquareFromPoint = useCallback((x: number, y: number): [number, number] | null => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const el = squareRefs.current[r][c];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return [r, c];
                }
            }
        }
        return null;
    }, []);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            if (!drag.active && drag.piece && Math.sqrt(dx * dx + dy * dy) > 8) {
                drag.active = true;
                onSquareClickRef.current(drag.fromRow, drag.fromCol);
            }
            if (drag.active) {
                setDragGhost({ x: e.clientX, y: e.clientY, piece: drag.piece, size: drag.size });
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            if (drag.active) {
                const sq = getSquareFromPoint(e.clientX, e.clientY);
                if (sq) {
                    onSquareDropRef.current(sq[0], sq[1]);
                }
            } else {
                onSquareClickRef.current(drag.fromRow, drag.fromCol);
            }
            dragRef.current = null;
            setDragGhost(null);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [getSquareFromPoint]);

    const isSelected = (r: number, c: number) =>
        selectedSquare !== null && selectedSquare[0] === r && selectedSquare[1] === c;

    const isLegalDest = (r: number, c: number) => legalDestinations.some(([lr, lc]) => lr === r && lc === c);

    const isLastMove = (r: number, c: number) => {
        if (lastMove === null) return false;
        if (lastMove.fromRow === r && lastMove.fromCol === c) return true;
        if (lastMove.toRow === r && lastMove.toCol === c) return true;
        if (lastMove.isCastling && lastMove.fromRow === r) {
            const rookCol = lastMove.toCol > lastMove.fromCol ? lastMove.toCol - 1 : lastMove.toCol + 1;
            if (rookCol === c) return true;
        }
        return false;
    };

    const isKingInCheck = (r: number, c: number) => {
        if (!inCheck || !kingInCheckColor || !kingPositions) return false;
        const kp = kingPositions[kingInCheckColor];
        return kp[0] === r && kp[1] === c;
    };

    const getSquareBg = (r: number, c: number) => {
        const isLight = (r + c) % 2 === 0;
        if (isKingInCheck(r, c)) return 'bg-red-500';
        if (isSelected(r, c)) return 'bg-yellow-300';
        if (isLastMove(r, c)) return isLight ? 'bg-yellow-100' : 'bg-yellow-600';
        return isLight ? 'bg-amber-100' : 'bg-amber-800';
    };

    const isDraggingFrom = (r: number, c: number) =>
        dragGhost !== null && selectedSquare !== null && selectedSquare[0] === r && selectedSquare[1] === c;

    const handleMouseDown = (r: number, c: number, e: React.MouseEvent) => {
        if (lockedRef.current) return;
        e.preventDefault();
        dragRef.current = {
            fromRow: r,
            fromCol: c,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            piece: board[r][c] ?? '',
            size: squareRefs.current[r][c]?.getBoundingClientRect().width ?? 56,
        };
    };

    const getRankLabel = (r: number) => String(8 - r);
    const getFileLabel = (c: number) => String.fromCharCode(97 + c);

    return (
        <div data-testid='chess-board' className='grid h-full w-full select-none grid-cols-8 grid-rows-8'>
            {rows.map((r, displayRow) =>
                cols.map((c, displayCol) => {
                    const piece = board[r][c];
                    const imgSrc = piece ? PIECE_IMAGES[piece] : null;
                    const isDragging = isDraggingFrom(r, c);
                    const isLight = (r + c) % 2 === 0;
                    const labelColor = isLight ? 'text-amber-800' : 'text-amber-100';

                    return (
                        <div
                            key={`${r}-${c}`}
                            data-square={`${r}-${c}`}
                            ref={el => {
                                squareRefs.current[r][c] = el;
                            }}
                            className={`relative flex items-center justify-center ${getSquareBg(r, c)} ${!locked ? 'cursor-pointer hover:opacity-90' : ''}`}
                            onMouseDown={e => handleMouseDown(r, c, e)}>
                            {displayCol === 0 && (
                                <span
                                    className={`pointer-events-none absolute left-0.5 top-0 text-[0.55rem] font-semibold ${labelColor}`}>
                                    {getRankLabel(r)}
                                </span>
                            )}
                            {displayRow === 7 && (
                                <span
                                    className={`pointer-events-none absolute bottom-0 right-0.5 text-[0.55rem] font-semibold ${labelColor}`}>
                                    {getFileLabel(c)}
                                </span>
                            )}
                            {!hidePieces && isLegalDest(r, c) && (
                                <div
                                    className={`absolute z-10 rounded-full ${piece ? 'inset-0 border-4 border-black/30' : 'h-1/4 w-1/4 bg-black/30'}`}
                                />
                            )}
                            {!hidePieces && imgSrc && (
                                <img
                                    src={imgSrc}
                                    alt={piece ?? ''}
                                    className={`pointer-events-none z-20 h-[85%] w-[85%] object-contain drop-shadow-md${isDragging ? ' opacity-30' : ''}`}
                                />
                            )}
                        </div>
                    );
                })
            )}

            {!hidePieces &&
                dragGhost &&
                createPortal(
                    <img
                        src={PIECE_IMAGES[dragGhost.piece]}
                        alt=''
                        style={{
                            position: 'fixed',
                            left: dragGhost.x - dragGhost.size / 2,
                            top: dragGhost.y - dragGhost.size / 2,
                            width: dragGhost.size,
                            height: dragGhost.size,
                            pointerEvents: 'none',
                            zIndex: 9999,
                            objectFit: 'contain',
                        }}
                    />,
                    document.body
                )}
        </div>
    );
}
