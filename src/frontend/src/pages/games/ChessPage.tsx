import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStatsPanel from '../../components/games/GameStatsPanel';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import GameLayout from '../../components/games/GameLayout';
import NewGameButtons from '../../components/games/NewGameButtons';
import PlayerCard from '../../components/PlayerCard';
import ChessBoard from '../../components/games/ChessBoard';
import EvalBar from '../../components/games/EvalBar';
import { useAuth } from '../../hooks/useAuth';
import { useStockfishEval } from '../../hooks/useStockfishEval';
import { boardToFen } from '../../lib/chessFen';
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
import PageMeta from '../../components/PageMeta';

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
    const [currentFen, setCurrentFen] = useState<string | null>(null);
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
    const [castlingRights, setCastlingRights] = useState<ChessGameState['castling_rights']>({
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true },
    });
    const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
    const [legalDestinations, setLegalDestinations] = useState<[number, number][]>([]);
    const [lastMove, setLastMove] = useState<{
        fromRow: number;
        fromCol: number;
        toRow: number;
        toCol: number;
        isCastling?: boolean;
    } | null>(null);
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [winner, setWinner] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{ sessionId: string; state: ChessGameState } | null>(null);
    const [showPromotionModal, setShowPromotionModal] = useState(false);
    const [showGameOverOverlay, setShowGameOverOverlay] = useState(false);
    const [pendingPromotion, setPendingPromotion] = useState<{
        fromRow: number;
        fromCol: number;
        toRow: number;
        toCol: number;
    } | null>(null);

    const esRef = useRef<EventSource | null>(null);
    const moveListRef = useRef<HTMLDivElement>(null);
    const evalState = useStockfishEval(phase === 'playing' ? currentFen : null);

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
        if ('castling_rights' in data && data.castling_rights) setCastlingRights(data.castling_rights);
        if ('fen' in data && data.fen) setCurrentFen(data.fen);
    }, []);

    const subscribeSSE = useCallback(
        (sid: string) => {
            closeSSE();
            const es = chessSubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onPlayerMove: (data: ChessMoveData) => {
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
                            isCastling: data.is_castling ?? false,
                        });
                    }
                    setSelectedSquare(null);
                    setLegalDestinations([]);
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
                            isCastling: data.is_castling ?? false,
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
                    setCurrentFen(state.fen ?? null);
                    setCurrentPlayer(state.current_player);
                    setPlayerColor(state.player_color);
                    setInCheck(state.in_check ?? false);
                    setCapturedPieces(state.captured_pieces);
                    setMoveHistory(state.move_history ?? []);
                    if (state.castling_rights) setCastlingRights(state.castling_rights);
                    if (state.king_positions) setKingPositions(state.king_positions);
                    if (state.last_move) {
                        setLastMove({
                            fromRow: state.last_move.fromRow,
                            fromCol: state.last_move.fromCol,
                            toRow: state.last_move.toRow,
                            toCol: state.last_move.toCol,
                            isCastling: state.last_move.is_castling,
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

    useEffect(() => {
        if (phase !== 'terminal') {
            setShowGameOverOverlay(false);
            return;
        }
        const timer = setTimeout(() => setShowGameOverOverlay(true), 300);
        return () => clearTimeout(timer);
    }, [phase]);

    const handleResume = () => {
        if (!pendingResume) return;
        const { sessionId: sid, state } = pendingResume;
        setSessionId(sid);
        setCurrentFen(state.fen ?? null);
        setBoard(state.board);
        setCurrentPlayer(state.current_player);
        setPlayerColor(state.player_color);
        setInCheck(state.in_check ?? false);
        setCapturedPieces(state.captured_pieces);
        setMoveHistory(state.move_history ?? []);
        if (state.castling_rights) setCastlingRights(state.castling_rights);
        if (state.king_positions) setKingPositions(state.king_positions);
        if (state.last_move) {
            setLastMove({
                fromRow: state.last_move.fromRow,
                fromCol: state.last_move.fromCol,
                toRow: state.last_move.toRow,
                toCol: state.last_move.toCol,
                isCastling: state.last_move.is_castling,
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
        setCurrentFen(null);
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
            setCurrentFen(state.fen ?? null);
            setBoard(state.board);
            setCurrentPlayer(state.current_player);
            setPlayerColor(state.player_color);
            setInCheck(state.in_check ?? false);
            setCapturedPieces(state.captured_pieces);
            if (state.castling_rights) setCastlingRights(state.castling_rights);
            if (state.king_positions) setKingPositions(state.king_positions);
            if (state.last_move) {
                setLastMove({
                    fromRow: state.last_move.fromRow,
                    fromCol: state.last_move.fromCol,
                    toRow: state.last_move.toRow,
                    toCol: state.last_move.toCol,
                    isCastling: state.last_move.is_castling,
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
        const prevBoard = board.map(r => [...r]);
        const prevFen = currentFen;
        setSelectedSquare(null);
        setLegalDestinations([]);
        setBoardLocked(true);
        setStatusText('Sending move...');

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
        setLastMove({
            fromRow,
            fromCol,
            toRow,
            toCol,
            isCastling: movingPiece?.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2,
        });

        const moverLower = movingPiece?.toLowerCase();
        const nextCastling = {
            white: { ...castlingRights.white },
            black: { ...castlingRights.black },
        };
        if (moverLower === 'k') {
            nextCastling[playerColor].kingside = false;
            nextCastling[playerColor].queenside = false;
        } else if (moverLower === 'r') {
            if (fromCol === 0) nextCastling[playerColor].queenside = false;
            if (fromCol === 7) nextCastling[playerColor].kingside = false;
        }
        const nextEnPassant: [number, number] | null =
            moverLower === 'p' && Math.abs(toRow - fromRow) === 2
                ? [playerColor === 'white' ? fromRow - 1 : fromRow + 1, fromCol]
                : null;
        setCurrentFen(boardToFen(newBoard, playerColor === 'white' ? 'b' : 'w', nextCastling, nextEnPassant));

        try {
            await chessMove(fromRow, fromCol, toRow, toCol, promotionPiece ?? undefined);
        } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
                setBoard(prevBoard);
                setCurrentFen(prevFen);
                setLastMove(null);
                setStatusText('Move rejected — please try again.');
                setBoardLocked(false);
            }
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
        setCurrentFen(null);
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
                <PageMeta title='Chess' description='Challenge an adaptive AI in a game of Chess.' noindex />
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='container mx-auto px-4 py-10'>
                <PageMeta title='Chess' description='Challenge an adaptive AI in a game of Chess.' noindex />
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
        <>
            <PageMeta title='Chess' description='Challenge an adaptive AI in a game of Chess.' noindex />
            <GameLayout
                aspect={1.03}
                board={
                    <div className='flex h-full w-full items-stretch gap-1'>
                        <div className='flex w-5 shrink-0'>
                            {phase === 'playing' && (
                                <EvalBar cp={evalState.cp} mate={evalState.mate} perspective={playerColor} />
                            )}
                        </div>
                        <div className='relative min-w-0 flex-1'>
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

                            {phase === 'terminal' && !showGameOverOverlay && (
                                <div className='absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-base-100/90 backdrop-blur-sm'>
                                    <p className='text-2xl font-bold'>
                                        {playerResult === 'win'
                                            ? 'You Win!'
                                            : playerResult === 'loss'
                                              ? 'You Lose'
                                              : 'Draw!'}
                                    </p>
                                </div>
                            )}

                            {phase === 'terminal' && showGameOverOverlay && (
                                <GameStartOverlay
                                    title={
                                        playerResult === 'win'
                                            ? 'You Win!'
                                            : playerResult === 'loss'
                                              ? 'You Lose'
                                              : 'Draw!'
                                    }
                                    canResume={false}
                                    onResume={() => {}}
                                    optionA={{ label: 'Play as White', onClick: () => handleStartGame(true) }}
                                    optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                                />
                            )}

                            {showPromotionModal && pendingPromotion && (
                                <div className='absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-base-100/80 backdrop-blur-sm'>
                                    <div className='rounded-xl bg-base-200 p-4 shadow-lg'>
                                        <p className='mb-3 text-center text-sm font-medium'>Promote pawn to:</p>
                                        <div className='flex gap-2'>
                                            {PROMOTION_PIECES.map(({ piece, label }) => {
                                                const imgKey =
                                                    playerColor === 'white' ? piece.toUpperCase() : piece.toLowerCase();
                                                return (
                                                    <button
                                                        key={piece}
                                                        className='btn btn-outline btn-square h-14 w-14'
                                                        title={label}
                                                        onClick={() => handlePromotion(piece)}>
                                                        <img
                                                            src={PIECE_IMG[imgKey]}
                                                            alt={label}
                                                            className='h-10 w-10 object-contain'
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
                }
                opponent={
                    <PlayerCard
                        name='AI Opponent'
                        isAi
                        statusText={phase === 'playing' ? statusText : undefined}
                        result={aiResult}
                    />
                }
                player={<PlayerCard name={user.displayName} avatarUrl={user.profilePicture} result={playerResult} />}
                controls={
                    <div className='flex h-full w-full flex-col gap-2'>
                        {showInfo && (
                            <>
                                {inCheck && currentPlayer === playerColor && phase === 'playing' && (
                                    <div className='shrink-0 text-center'>
                                        <span className='badge badge-error badge-sm'>Check!</span>
                                    </div>
                                )}
                                <div className='flex min-h-6 shrink-0 flex-wrap gap-1'>
                                    {capturedPieces.ai.map((p, i) => (
                                        <img key={i} src={PIECE_IMG[p]} alt={p} className='h-5 w-5 object-contain' />
                                    ))}
                                </div>
                                <div className='h-px shrink-0 bg-base-content/20' />
                                <div ref={moveListRef} className='min-h-0 flex-1 overflow-y-auto'>
                                    {movePairs.map((pair, i) => (
                                        <div key={i} className='flex gap-1 text-xs leading-5'>
                                            <span className='w-6 shrink-0 text-base-content/50'>{i + 1}.</span>
                                            <span className='flex-1'>{pair.white ?? ''}</span>
                                            <span className='flex-1'>{pair.black ?? ''}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className='h-px shrink-0 bg-base-content/20' />
                                <div className='flex min-h-6 shrink-0 flex-wrap gap-1'>
                                    {capturedPieces.player.map((p, i) => (
                                        <img key={i} src={PIECE_IMG[p]} alt={p} className='h-5 w-5 object-contain' />
                                    ))}
                                </div>
                            </>
                        )}

                        {phase === 'playing' && (
                            <NewGameButtons
                                className='flex flex-wrap justify-center gap-2'
                                optionA={{ label: 'Play as White', onClick: () => handleStartGame(true) }}
                                optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                                onResign={handleResign}
                            />
                        )}

                        <GameStatsPanel gameType='chess' />
                    </div>
                }
            />

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
        </>
    );
}
