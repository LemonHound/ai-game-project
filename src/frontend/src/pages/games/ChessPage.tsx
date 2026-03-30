import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import NewGameButtons from '../../components/games/NewGameButtons';
import PlayerCard from '../../components/PlayerCard';
import ChessBoard from '../../components/games/ChessBoard';
import { useAuth } from '../../hooks/useAuth';
import {
    chessLegalMoves,
    chessMove,
    chessNewGame,
    chessResume,
    chessSubscribeSSE,
    type ChessGameState,
    type ChessMoveData,
} from '../../api/chess';
import { forfeitGame } from '../../api/games';

const HINT_KEY = 'chess_game_hint';
const HINT_TTL_MS = 10 * 60 * 1000;

function getHint(): boolean {
    try {
        const raw = localStorage.getItem(HINT_KEY);
        if (!raw) return false;
        const { expires } = JSON.parse(raw) as { expires: number };
        return Date.now() < expires;
    } catch {
        return false;
    }
}

function setHint() {
    localStorage.setItem(HINT_KEY, JSON.stringify({ expires: Date.now() + HINT_TTL_MS }));
}

function clearHint() {
    localStorage.removeItem(HINT_KEY);
}

type Phase = 'loading' | 'newgame' | 'resumeprompt' | 'playing' | 'terminal';

const PROMOTION_PIECES = [
    { piece: 'Q', label: 'Queen' },
    { piece: 'R', label: 'Rook' },
    { piece: 'B', label: 'Bishop' },
    { piece: 'N', label: 'Knight' },
];

const PIECE_IMG: Record<string, string> = {
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

function emptyBoard(): (string | null)[][] {
    return Array(8)
        .fill(null)
        .map(() => Array(8).fill(null));
}

/**
 * Renders the full Chess game page, managing game state, legal moves, SSE updates, and session persistence.
 */
export default function ChessPage() {
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [board, setBoard] = useState<(string | null)[][]>(emptyBoard());
    const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
    const [currentPlayer, setCurrentPlayer] = useState<'white' | 'black'>('white');
    const [inCheck, setInCheck] = useState(false);
    const [capturedPieces, setCapturedPieces] = useState<{ player: string[]; ai: string[] }>({ player: [], ai: [] });
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [kingPositions, setKingPositions] = useState<{ white: [number, number]; black: [number, number] }>({
        white: [7, 4],
        black: [0, 4],
    });
    const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
    const [legalDestinations, setLegalDestinations] = useState<[number, number][]>([]);
    const [lastMove, setLastMove] = useState<{ fromRow: number; fromCol: number; toRow: number; toCol: number } | null>(
        null
    );
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [winner, setWinner] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{ sessionId: string; state: ChessGameState } | null>(null);
    const [showPromotionModal, setShowPromotionModal] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState<{
        fromRow: number;
        fromCol: number;
        toRow: number;
        toCol: number;
    } | null>(null);

    const esRef = useRef<EventSource | null>(null);
    const moveListRef = useRef<HTMLDivElement>(null);

    const closeSSE = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    }, []);

    const applyStateFromData = useCallback((data: ChessMoveData | ChessGameState) => {
        if ('board' in data && data.board) setBoard(data.board);
        if ('current_player' in data && data.current_player) setCurrentPlayer(data.current_player);
        if ('in_check' in data && data.in_check !== undefined) setInCheck(data.in_check ?? false);
        if ('captured_pieces' in data && data.captured_pieces) setCapturedPieces(data.captured_pieces);
        if ('king_positions' in data && data.king_positions) setKingPositions(data.king_positions);
    }, []);

    const subscribeSSE = useCallback(
        (sid: string) => {
            closeSSE();
            const es = chessSubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onPlayerMove: (data: ChessMoveData) => {
                    if (data.notation) setMoveHistory(h => [...h, data.notation!]);
                },
                onMove: (data: ChessMoveData) => {
                    applyStateFromData(data);
                    if (data.notation) setMoveHistory(h => [...h, data.notation!]);
                    if (
                        data.toRow !== null &&
                        data.toRow !== undefined &&
                        data.fromRow !== null &&
                        data.fromRow !== undefined
                    ) {
                        setLastMove({
                            fromRow: data.fromRow!,
                            fromCol: data.fromCol!,
                            toRow: data.toRow!,
                            toCol: data.toCol!,
                        });
                    }
                    setSelectedSquare(null);
                    setLegalDestinations([]);

                    if (data.status === 'complete') {
                        setWinner(data.winner ?? null);
                        setBoardLocked(true);
                        setPhase('terminal');
                        clearHint();
                        closeSSE();
                    } else {
                        setBoardLocked(false);
                        setStatusText('');
                        setHint();
                    }
                },
                onError: (code, message) => {
                    if (code === 'unauthorized' || message.toLowerCase().includes('auth')) {
                        setShowAuthModal(true);
                    } else {
                        setStatusText(`Error: ${message}`);
                    }
                },
            });
            esRef.current = es;
        },
        [closeSSE, applyStateFromData]
    );

    const loadSession = useCallback(async () => {
        if (!user) return;
        try {
            const { id, state } = await chessResume();
            if (id && state) {
                setHint();
                if (!state.game_active) {
                    setBoard(state.board);
                    setCurrentPlayer(state.current_player);
                    setPlayerColor(state.player_color);
                    setInCheck(state.in_check ?? false);
                    setCapturedPieces(state.captured_pieces);
                    if (state.king_positions) setKingPositions(state.king_positions);
                    if (state.last_move) {
                        setLastMove({
                            fromRow: state.last_move.fromRow,
                            fromCol: state.last_move.fromCol,
                            toRow: state.last_move.toRow,
                            toCol: state.last_move.toCol,
                        });
                    }
                    setSessionId(id);
                    setBoardLocked(true);
                    setPhase('terminal');
                } else {
                    setPlayerColor(state.player_color);
                    setPendingResume({ sessionId: id, state });
                    setBoardLocked(true);
                    setPhase('resumeprompt');
                }
            } else {
                clearHint();
                setPhase('newgame');
            }
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
                clearHint();
                setPhase('newgame');
            }
        }
    }, [user]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setPhase('newgame');
            return;
        }
        loadSession();
    }, [user, authLoading, loadSession]);

    useEffect(() => {
        const handler = () => clearHint();
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

    useEffect(() => {
        return () => closeSSE();
    }, [closeSSE]);

    useEffect(() => {
        if (moveListRef.current) {
            moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
        }
    }, [moveHistory]);

    const handleResume = () => {
        if (!pendingResume) return;
        const { sessionId: sid, state } = pendingResume;
        setSessionId(sid);
        setBoard(state.board);
        setCurrentPlayer(state.current_player);
        setPlayerColor(state.player_color);
        setInCheck(state.in_check ?? false);
        setCapturedPieces(state.captured_pieces);
        if (state.king_positions) setKingPositions(state.king_positions);
        if (state.last_move) {
            setLastMove({
                fromRow: state.last_move.fromRow,
                fromCol: state.last_move.fromCol,
                toRow: state.last_move.toRow,
                toCol: state.last_move.toCol,
            });
        }
        const isPlayerTurn = state.current_player === state.player_color;
        setBoardLocked(!isPlayerTurn);
        setPhase('playing');
        subscribeSSE(sid);
        setPendingResume(null);
    };

    const handleStartGame = async (goFirst: boolean) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        clearHint();
        setPendingResume(null);
        setBoard(emptyBoard());
        setMoveHistory([]);
        setCapturedPieces({ player: [], ai: [] });
        setLastMove(null);
        setWinner(null);
        setStatusText('');
        setSelectedSquare(null);
        setLegalDestinations([]);
        setInCheck(false);
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { id, state } = await chessNewGame(goFirst);
            setSessionId(id);
            setBoard(state.board);
            setCurrentPlayer(state.current_player);
            setPlayerColor(state.player_color);
            setInCheck(state.in_check ?? false);
            setCapturedPieces(state.captured_pieces);
            if (state.king_positions) setKingPositions(state.king_positions);
            if (state.last_move) {
                setLastMove({
                    fromRow: state.last_move.fromRow,
                    fromCol: state.last_move.fromCol,
                    toRow: state.last_move.toRow,
                    toCol: state.last_move.toCol,
                });
                if (state.last_move.notation) {
                    setMoveHistory([state.last_move.notation]);
                }
            }
            const isPlayerTurn = state.current_player === state.player_color;
            setBoardLocked(!isPlayerTurn);
            setHint();
            subscribeSSE(id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const isPlayerPiece = (piece: string): boolean => {
        return playerColor === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
    };

    const submitMove = async (
        fromRow: number,
        fromCol: number,
        toRow: number,
        toCol: number,
        promotionPiece: string | null
    ) => {
        const movingPiece = board[fromRow][fromCol];
        setSelectedSquare(null);
        setLegalDestinations([]);
        setBoardLocked(true);
        setStatusText('');

        const newBoard = board.map(r => [...r]);
        newBoard[fromRow][fromCol] = null;
        newBoard[toRow][toCol] = promotionPiece
            ? playerColor === 'white'
                ? promotionPiece.toUpperCase()
                : promotionPiece.toLowerCase()
            : movingPiece;

        if (movingPiece?.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
            const isKingside = toCol > fromCol;
            const rookFromCol = isKingside ? 7 : 0;
            const rookToCol = isKingside ? toCol - 1 : toCol + 1;
            newBoard[fromRow][rookToCol] = newBoard[fromRow][rookFromCol];
            newBoard[fromRow][rookFromCol] = null;
        }

        if (movingPiece?.toLowerCase() === 'p' && fromCol !== toCol && !board[toRow][toCol]) {
            newBoard[fromRow][toCol] = null;
        }

        setBoard(newBoard);
        setLastMove({ fromRow, fromCol, toRow, toCol });

        try {
            await chessMove(fromRow, fromCol, toRow, toCol, promotionPiece ?? undefined);
        } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            else setBoardLocked(false);
        }
    };

    const handleSquareClick = async (row: number, col: number) => {
        if (boardLocked || currentPlayer !== playerColor) return;

        const piece = board[row][col];

        if (selectedSquare) {
            const [sr, sc] = selectedSquare;
            if (legalDestinations.some(([r, c]) => r === row && c === col)) {
                const movingPiece = board[sr][sc];
                const isPromotion =
                    movingPiece &&
                    movingPiece.toLowerCase() === 'p' &&
                    ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7));

                if (isPromotion) {
                    setPendingPromotion({ fromRow: sr, fromCol: sc, toRow: row, toCol: col });
                    setShowPromotionModal(true);
                    return;
                }

                await submitMove(sr, sc, row, col, null);
            } else if (piece && isPlayerPiece(piece)) {
                setSelectedSquare([row, col]);
                const destinations = await chessLegalMoves(row, col);
                setLegalDestinations(destinations.map(m => [m.toRow, m.toCol] as [number, number]));
            } else {
                setSelectedSquare(null);
                setLegalDestinations([]);
            }
        } else {
            if (piece && isPlayerPiece(piece)) {
                setSelectedSquare([row, col]);
                const destinations = await chessLegalMoves(row, col);
                setLegalDestinations(destinations.map(m => [m.toRow, m.toCol] as [number, number]));
            }
        }
    };

    const handleSquareDrop = async (row: number, col: number) => {
        if (boardLocked || currentPlayer !== playerColor) return;
        if (!selectedSquare) return;
        const [sr, sc] = selectedSquare;
        if (!legalDestinations.some(([r, c]) => r === row && c === col)) return;
        const movingPiece = board[sr][sc];
        const isPromotion =
            movingPiece &&
            movingPiece.toLowerCase() === 'p' &&
            ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7));

        if (isPromotion) {
            setPendingPromotion({ fromRow: sr, fromCol: sc, toRow: row, toCol: col });
            setShowPromotionModal(true);
            return;
        }

        await submitMove(sr, sc, row, col, null);
    };

    const handlePromotion = async (choice: string) => {
        if (!pendingPromotion) return;
        const promo = playerColor === 'white' ? choice.toUpperCase() : choice.toLowerCase();
        setShowPromotionModal(false);
        setPendingPromotion(null);
        await submitMove(
            pendingPromotion.fromRow,
            pendingPromotion.fromCol,
            pendingPromotion.toRow,
            pendingPromotion.toCol,
            promo
        );
    };

    const handleNewGame = () => {
        closeSSE();
        clearHint();
        setSessionId(null);
        setPendingResume(null);
        setWinner(null);
        setStatusText('');
        setSelectedSquare(null);
        setLegalDestinations([]);
        setBoardLocked(true);
        setPhase('newgame');
    };

    const handleResign = () => {
        closeSSE();
        clearHint();
        if (sessionId) forfeitGame('chess', sessionId).catch(() => {});
        setWinner('ai');
        setBoardLocked(true);
        setPhase('terminal');
    };

    const showInfo = phase === 'resumeprompt' || phase === 'playing' || phase === 'terminal';
    const aiColor = playerColor === 'white' ? 'Black' : 'White';
    const playerColorLabel = playerColor === 'white' ? 'White' : 'Black';

    const playerResult: 'win' | 'loss' | 'draw' | null =
        phase === 'terminal' && winner !== null
            ? winner === 'draw'
                ? 'draw'
                : winner === 'player'
                  ? 'win'
                  : 'loss'
            : null;

    const aiResult: 'win' | 'loss' | 'draw' | null =
        playerResult === null ? null : playerResult === 'draw' ? 'draw' : playerResult === 'win' ? 'loss' : 'win';

    const kingInCheckColor: 'white' | 'black' | null = inCheck ? currentPlayer : null;

    const movePairs = moveHistory.reduce<Array<{ white?: string; black?: string }>>((acc, notation, i) => {
        const pairIdx = Math.floor(i / 2);
        if (!acc[pairIdx]) acc[pairIdx] = {};
        if (i % 2 === 0) acc[pairIdx].white = notation;
        else acc[pairIdx].black = notation;
        return acc;
    }, []);

    if (authLoading) {
        return (
            <div className='container mx-auto px-4 py-10 flex justify-center'>
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='container mx-auto px-4 py-10'>
                <h1 className='mb-6 text-4xl font-bold text-center'>Chess</h1>
                <div className='flex justify-center'>
                    <div className='card bg-base-200 w-full max-w-sm'>
                        <div className='card-body text-center'>
                            <p className='mb-4'>Sign in to play.</p>
                            <button className='btn btn-primary' onClick={() => setShowAuthModal(true)}>
                                Sign In
                            </button>
                        </div>
                    </div>
                </div>
                {showAuthModal && (
                    <AuthModal open={showAuthModal} initialTab='login' onClose={() => setShowAuthModal(false)} />
                )}
            </div>
        );
    }

    void sessionId;

    return (
        <div className='container mx-auto px-4 py-4 max-w-4xl'>
            <h1 className='mb-3 text-3xl font-bold text-center'>Chess</h1>

            <div className='flex gap-4 items-stretch'>
                <div className='flex flex-col'>
                    <PlayerCard
                        name='AI Opponent'
                        isAi
                        symbol={showInfo ? aiColor : undefined}
                        statusText={phase === 'playing' ? statusText : undefined}
                        result={aiResult}
                    />

                    <div className='relative my-2 flex justify-center'>
                        <div className='relative'>
                            <ChessBoard
                                board={board}
                                playerColor={playerColor}
                                selectedSquare={selectedSquare}
                                legalDestinations={legalDestinations}
                                lastMove={lastMove}
                                inCheck={inCheck}
                                locked={boardLocked || phase !== 'playing'}
                                onSquareClick={handleSquareClick}
                                onSquareDrop={handleSquareDrop}
                                kingInCheckColor={kingInCheckColor}
                                kingPositions={kingPositions}
                                hidePieces={phase !== 'playing'}
                            />

                            {phase === 'loading' && (
                                <div className='absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/80'>
                                    <span className='loading loading-spinner loading-lg' />
                                </div>
                            )}

                            {(phase === 'newgame' || phase === 'resumeprompt') && (
                                <GameStartOverlay
                                    canResume={phase === 'resumeprompt'}
                                    onResume={handleResume}
                                    optionA={{ label: 'Play as White', onClick: () => handleStartGame(true) }}
                                    optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                                />
                            )}

                            {phase === 'terminal' && (
                                <div className='absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-lg bg-base-100/90 backdrop-blur-sm'>
                                    <div
                                        className={`text-2xl font-bold ${playerResult === 'win' ? 'text-success' : playerResult === 'loss' ? 'text-error' : 'text-warning'}`}>
                                        {playerResult === 'win'
                                            ? 'You Win!'
                                            : playerResult === 'loss'
                                              ? 'You Lose'
                                              : 'Draw'}
                                    </div>
                                    <div className='flex flex-col items-center gap-2 w-full max-w-xs px-4'>
                                        <div className='flex items-center gap-2 w-full'>
                                            <div className='flex-1 h-px bg-base-content/20' />
                                            <span className='text-xs text-base-content/50 uppercase tracking-wider'>
                                                Play Again
                                            </span>
                                            <div className='flex-1 h-px bg-base-content/20' />
                                        </div>
                                        <div className='flex gap-2 w-full'>
                                            <button
                                                className='btn btn-primary flex-1'
                                                onClick={() => handleStartGame(true)}>
                                                Play as White
                                            </button>
                                            <button
                                                className='btn btn-secondary flex-1'
                                                onClick={() => handleStartGame(false)}>
                                                Play as Black
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {showPromotionModal && pendingPromotion && (
                                <div className='absolute inset-0 flex items-center justify-center bg-base-100/80 backdrop-blur-sm rounded-lg z-30'>
                                    <div className='bg-base-200 rounded-xl p-4 shadow-lg'>
                                        <p className='text-sm font-medium text-center mb-3'>Promote pawn to:</p>
                                        <div className='flex gap-2'>
                                            {PROMOTION_PIECES.map(({ piece, label }) => {
                                                const imgKey =
                                                    playerColor === 'white' ? piece.toUpperCase() : piece.toLowerCase();
                                                return (
                                                    <button
                                                        key={piece}
                                                        className='btn btn-outline btn-square w-14 h-14'
                                                        title={label}
                                                        onClick={() => handlePromotion(piece)}>
                                                        <img
                                                            src={PIECE_IMG[imgKey]}
                                                            alt={label}
                                                            className='w-10 h-10 object-contain'
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {showInfo && inCheck && currentPlayer === playerColor && phase === 'playing' && (
                        <div className='text-center mb-1'>
                            <span className='badge badge-error badge-lg'>Check!</span>
                        </div>
                    )}

                    <PlayerCard
                        name={user.displayName || user.username}
                        avatarUrl={user.profilePicture}
                        symbol={showInfo ? playerColorLabel : undefined}
                        result={playerResult}
                    />
                </div>

                {showInfo && (
                    <div className='flex flex-col flex-1 min-h-0 overflow-hidden bg-base-200 rounded-lg p-3'>
                        <div className='flex flex-wrap gap-1 min-h-6 shrink-0'>
                            {capturedPieces.ai.map((p, i) => (
                                <img key={i} src={PIECE_IMG[p]} alt={p} className='w-5 h-5 object-contain' />
                            ))}
                        </div>

                        <div className='h-px bg-base-content/20 my-2 shrink-0' />

                        <div ref={moveListRef} className='flex-1 min-h-0 max-h-[50vh] overflow-y-auto'>
                            {movePairs.map((pair, i) => (
                                <div key={i} className='flex text-xs gap-1 leading-5'>
                                    <span className='w-6 text-base-content/50 shrink-0'>{i + 1}.</span>
                                    <span className='flex-1'>{pair.white ?? ''}</span>
                                    <span className='flex-1'>{pair.black ?? ''}</span>
                                </div>
                            ))}
                        </div>

                        <div className='h-px bg-base-content/20 my-2 shrink-0' />

                        <div className='flex flex-wrap gap-1 min-h-6 shrink-0'>
                            {capturedPieces.player.map((p, i) => (
                                <img key={i} src={PIECE_IMG[p]} alt={p} className='w-5 h-5 object-contain' />
                            ))}
                        </div>

                        {phase === 'playing' && (
                            <div className='mt-2 shrink-0'>
                                <NewGameButtons
                                    optionA={{ label: 'Play as White', onClick: () => handleStartGame(true) }}
                                    optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                                    onResign={handleResign}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showAuthModal && (
                <AuthModal
                    open={showAuthModal}
                    initialTab='login'
                    onClose={() => {
                        setShowAuthModal(false);
                        clearHint();
                        handleNewGame();
                    }}
                />
            )}
        </div>
    );
}
