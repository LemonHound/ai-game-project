import { useCallback, useEffect, useRef, useState } from 'react';

interface CheckersBoardProps {
    board: string[];
    playerSymbol: string;
    currentTurn: 'player' | 'ai' | null;
    selectedPiece: number | null;
    validDestinations: number[];
    legalPieces: number[];
    mustCapture: number | null;
    locked: boolean;
    flipped: boolean;
    lastMove: { from: number; to: number } | null;
    onPieceClick: (pos: number) => void;
    onPieceDragStart: (pos: number) => void;
    onSquareClick: (pos: number) => void;
    onSquareDrop: (pos: number) => void;
    hidePieces?: boolean;
}

interface DragState {
    fromPos: number;
    startX: number;
    startY: number;
    active: boolean;
    isRed: boolean;
    isKing: boolean;
}

function PieceDisplay({ code }: { code: string }) {
    const isRed = code === 'R' || code === 'r';
    const isKing = code === 'r' || code === 'b';

    const baseClass = isRed ? 'bg-red-500 border-red-700' : 'bg-neutral-800 border-neutral-600';

    return (
        <div className={`w-3/4 h-3/4 rounded-full border-2 flex items-center justify-center ${baseClass}`}>
            {isKing && <div className='w-1/2 h-1/2 rounded-full bg-white/40 border border-white/60' />}
        </div>
    );
}

export default function CheckersBoard({
    board,
    currentTurn,
    selectedPiece,
    validDestinations,
    legalPieces,
    mustCapture,
    locked,
    flipped,
    lastMove,
    onPieceClick,
    onPieceDragStart,
    onSquareClick,
    onSquareDrop,
    hidePieces = false,
}: CheckersBoardProps) {
    const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const [dragGhost, setDragGhost] = useState<{ x: number; y: number; isRed: boolean; isKing: boolean } | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const squareRefs = useRef<(HTMLDivElement | null)[]>(Array(64).fill(null));
    const onPieceDragStartRef = useRef(onPieceDragStart);
    const onSquareDropRef = useRef(onSquareDrop);
    const onPieceClickRef = useRef(onPieceClick);
    const lockedRef = useRef(locked);
    const currentTurnRef = useRef(currentTurn);

    onPieceDragStartRef.current = onPieceDragStart;
    onSquareDropRef.current = onSquareDrop;
    onPieceClickRef.current = onPieceClick;
    lockedRef.current = locked;
    currentTurnRef.current = currentTurn;

    const getPosFromPoint = useCallback((x: number, y: number): number | null => {
        for (let pos = 0; pos < 64; pos++) {
            const el = squareRefs.current[pos];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return pos;
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
            if (!drag.active && Math.sqrt(dx * dx + dy * dy) > 8) {
                drag.active = true;
                onPieceDragStartRef.current(drag.fromPos);
            }
            if (drag.active) {
                setDragGhost({ x: e.clientX, y: e.clientY, isRed: drag.isRed, isKing: drag.isKing });
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            if (drag.active) {
                const pos = getPosFromPoint(e.clientX, e.clientY);
                if (pos !== null) {
                    onSquareDropRef.current(pos);
                }
            } else {
                onPieceClickRef.current(drag.fromPos);
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
    }, [getPosFromPoint]);

    const handleMouseDown = (pos: number, e: React.MouseEvent) => {
        if (lockedRef.current || currentTurnRef.current !== 'player') return;
        const piece = board[pos];
        if (!piece || piece === '_') return;
        e.preventDefault();
        dragRef.current = {
            fromPos: pos,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            isRed: piece === 'R' || piece === 'r',
            isKing: piece === 'r' || piece === 'b',
        };
    };

    return (
        <div
            className='inline-grid border-2 border-neutral-700'
            style={{ gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', maxWidth: '480px' }}
            aria-label='Checkers board'>
            {rows.map(row =>
                [0, 1, 2, 3, 4, 5, 6, 7].map(col => {
                    const pos = row * 8 + col;
                    const isLight = (row + col) % 2 === 0;
                    const piece = board[pos];
                    const hasPiece = piece !== '_' && piece !== undefined;
                    const isSelected = selectedPiece === pos;
                    const isDestination = validDestinations.includes(pos);
                    const isLegalPiece = legalPieces.includes(pos);
                    const isLastMoveSquare = lastMove !== null && (lastMove.from === pos || lastMove.to === pos);

                    const isInteractivePiece =
                        !locked &&
                        currentTurn === 'player' &&
                        hasPiece &&
                        (mustCapture !== null ? pos === mustCapture : isLegalPiece);

                    const isNonInteractivePiece =
                        !locked && currentTurn === 'player' && hasPiece && !isInteractivePiece;

                    const isDestinationInteractive = !locked && currentTurn === 'player' && !hasPiece && isDestination;

                    const isDraggingThis = dragGhost !== null && selectedPiece === pos && isInteractivePiece;

                    let squareBg = isLight ? 'bg-amber-100' : 'bg-amber-800';
                    if (!isLight && isSelected) squareBg = 'bg-yellow-500';
                    else if (!isLight && isDestination) squareBg = 'bg-green-600/60';
                    else if (!isLight && isLastMoveSquare) squareBg = 'bg-yellow-700';

                    return (
                        <div
                            key={pos}
                            ref={el => {
                                squareRefs.current[pos] = el;
                            }}
                            className={`relative aspect-square flex items-center justify-center ${squareBg}`}
                            onClick={() => {
                                if (isDestinationInteractive) {
                                    onSquareClick(pos);
                                }
                            }}
                            style={{ cursor: isDestinationInteractive ? 'pointer' : 'default' }}>
                            {!hidePieces && isDestination && !hasPiece && (
                                <div className='absolute w-1/3 h-1/3 rounded-full bg-green-400/70 pointer-events-none' />
                            )}
                            {!hidePieces && hasPiece && (
                                <div
                                    className={`absolute inset-0 flex items-center justify-center ${isInteractivePiece ? 'cursor-pointer' : 'cursor-default'}`}
                                    onMouseDown={e => {
                                        if (isInteractivePiece) handleMouseDown(pos, e);
                                    }}
                                    onClick={e => {
                                        if (isInteractivePiece) {
                                            e.stopPropagation();
                                        }
                                    }}>
                                    <div
                                        className={`w-3/4 h-3/4 flex items-center justify-center transition-all ${isInteractivePiece ? 'hover:scale-110' : ''} ${isSelected ? 'ring-4 ring-yellow-300 rounded-full' : ''} ${isNonInteractivePiece ? 'opacity-35' : ''} ${isDraggingThis ? 'opacity-30' : ''}`}>
                                        <PieceDisplay code={piece} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {!hidePieces && dragGhost && (
                <div
                    style={{
                        position: 'fixed',
                        left: dragGhost.x - 20,
                        top: dragGhost.y - 20,
                        width: 40,
                        height: 40,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        borderRadius: '50%',
                        border: `2px solid ${dragGhost.isRed ? '#b91c1c' : '#44403c'}`,
                        backgroundColor: dragGhost.isRed ? '#ef4444' : '#1c1917',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                    {dragGhost.isKing && (
                        <div
                            style={{
                                width: '50%',
                                height: '50%',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.4)',
                                border: '1px solid rgba(255,255,255,0.6)',
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
