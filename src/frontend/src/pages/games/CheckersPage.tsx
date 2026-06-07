import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStatsPanel from '../../components/games/GameStatsPanel';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import GameLayout from '../../components/games/GameLayout';
import NewGameButtons from '../../components/games/NewGameButtons';
import PlayerCard from '../../components/PlayerCard';
import CheckersBoard from '../../components/games/CheckersBoard';
import { useAuth } from '../../hooks/useAuth';
import {
    checkersMove,
    checkersNewGame,
    checkersResume,
    checkersSubscribeSSE,
    type CheckersGameState,
    type CheckersMoveData,
} from '../../api/checkers';
import { forfeitGame } from '../../api/games';
import PageMeta from '../../components/PageMeta';

const HINT_KEY = 'checkers_game_hint';
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

function getValidDestinations(board: string[], pos: number, pieceSymbol: string, mustCapture: number | null): number[] {
    const piece = board[pos];
    if (!piece || piece === '_') return [];

    const row = Math.floor(pos / 8);
    const col = pos % 8;
    const isRed = piece === 'R' || piece === 'r';
    const isKing = piece === 'r' || piece === 'b';

    const directions: [number, number][] = isKing
        ? [
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
          ]
        : isRed
          ? [
                [-1, -1],
                [-1, 1],
            ]
          : [
                [1, -1],
                [1, 1],
            ];

    const isOpponent = (p: string) => (isRed ? p === 'B' || p === 'b' : p === 'R' || p === 'r');

    const destinations: number[] = [];

    for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const npos = nr * 8 + nc;
        if ((nr + nc) % 2 !== 1) continue;

        if (mustCapture === pos) {
            if (board[npos] !== '_' && isOpponent(board[npos])) {
                const jr = nr + dr;
                const jc = nc + dc;
                if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7) {
                    const jpos = jr * 8 + jc;
                    if (board[jpos] === '_') {
                        destinations.push(jpos);
                    }
                }
            }
        } else {
            if (board[npos] === '_') {
                destinations.push(npos);
            } else if (isOpponent(board[npos])) {
                const jr = nr + dr;
                const jc = nc + dc;
                if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7) {
                    const jpos = jr * 8 + jc;
                    if (board[jpos] === '_') {
                        destinations.push(jpos);
                    }
                }
            }
        }
    }

    return destinations;
}

/**
 * Renders the full Checkers game page, managing game state, SSE moves, and session persistence.
 */
export default function CheckersPage() {
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [board, setBoard] = useState<string[]>(Array(64).fill('_'));
    const [playerSymbol, setPlayerSymbol] = useState<string>('R');
    const [aiSymbol, setAiSymbol] = useState<string>('B');
    const [playerStarts, setPlayerStarts] = useState<boolean>(true);
    const [currentTurn, setCurrentTurn] = useState<'player' | 'ai' | null>('player');
    const [mustCapture, setMustCapture] = useState<number | null>(null);
    const [legalPieces, setLegalPieces] = useState<number[]>([]);
    const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
    const [validDestinations, setValidDestinations] = useState<number[]>([]);
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [winner, setWinner] = useState<'player' | 'ai' | null>(null);
    const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{
        sessionId: string;
        state: CheckersGameState;
    } | null>(null);
    const [showGameOverOverlay, setShowGameOverOverlay] = useState(false);

    const esRef = useRef<EventSource | null>(null);

    const closeSSE = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    }, []);

    const applyMoveData = useCallback((data: CheckersMoveData) => {
        if (data.board) setBoard(data.board);
        if (data.current_turn !== undefined) setCurrentTurn(data.current_turn);
        if (data.must_capture !== undefined) setMustCapture(data.must_capture);
        if (data.legal_pieces !== undefined) setLegalPieces(data.legal_pieces);
        if (data.from !== null && data.from !== undefined && data.to !== null && data.to !== undefined) {
            setLastMove({ from: data.from, to: data.to });
        }
        setSelectedPiece(null);
        setValidDestinations([]);
    }, []);

    const subscribeSSE = useCallback(
        (sid: string) => {
            closeSSE();
            const es = checkersSubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onMove: data => {
                    applyMoveData(data);
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
        [closeSSE, applyMoveData]
    );

    const loadSession = useCallback(async () => {
        if (!user) return;
        try {
            const { id, state } = await checkersResume();
            if (id && state) {
                setHint();
                if (!state.game_active) {
                    setBoard(state.board);
                    setCurrentTurn(state.current_turn);
                    setPlayerSymbol(state.player_symbol);
                    setAiSymbol(state.ai_symbol);
                    setPlayerStarts(state.player_starts);
                    setMustCapture(state.must_capture);
                    setLegalPieces(state.legal_pieces);
                    if (state.last_move) setLastMove({ from: state.last_move.from, to: state.last_move.to });
                    setSessionId(id);
                    setBoardLocked(true);
                    setPhase('terminal');
                } else {
                    setPlayerSymbol(state.player_symbol);
                    setAiSymbol(state.ai_symbol);
                    setPlayerStarts(state.player_starts);
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
        setBoard(state.board);
        setCurrentTurn(state.current_turn);
        setPlayerSymbol(state.player_symbol);
        setAiSymbol(state.ai_symbol);
        setPlayerStarts(state.player_starts);
        setMustCapture(state.must_capture);
        setLegalPieces(state.legal_pieces);
        if (state.last_move) setLastMove({ from: state.last_move.from, to: state.last_move.to });
        setBoardLocked(state.current_turn === 'ai');
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
        setBoard(Array(64).fill('_'));
        setWinner(null);
        setLastMove(null);
        setStatusText('');
        setSelectedPiece(null);
        setValidDestinations([]);
        setMustCapture(null);
        setLegalPieces([]);
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { id, state } = await checkersNewGame(goFirst);
            setSessionId(id);
            setBoard(state.board);
            setCurrentTurn(state.current_turn);
            setPlayerSymbol(state.player_symbol);
            setAiSymbol(state.ai_symbol);
            setPlayerStarts(state.player_starts);
            setMustCapture(state.must_capture);
            setLegalPieces(state.legal_pieces);
            setBoardLocked(state.current_turn === 'ai');
            setHint();
            subscribeSSE(id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const handlePieceClick = (pos: number) => {
        if (boardLocked || currentTurn !== 'player') return;
        if (selectedPiece === pos) {
            setSelectedPiece(null);
            setValidDestinations([]);
            return;
        }
        setSelectedPiece(pos);
        const dests = getValidDestinations(board, pos, playerSymbol, mustCapture);
        setValidDestinations(dests);
    };

    const handlePieceDragStart = (pos: number) => {
        if (boardLocked || currentTurn !== 'player') return;
        setSelectedPiece(pos);
        const dests = getValidDestinations(board, pos, playerSymbol, mustCapture);
        setValidDestinations(dests);
    };

    const handleSquareClick = async (pos: number) => {
        if (boardLocked || currentTurn !== 'player' || selectedPiece === null) return;
        if (!validDestinations.includes(pos)) return;

        const from = selectedPiece;

        const prevBoard = board.slice();
        const newBoard = board.slice();
        const piece = newBoard[from];
        if (Math.abs(Math.floor(pos / 8) - Math.floor(from / 8)) === 2) {
            newBoard[(from + pos) / 2] = '_';
        }
        newBoard[pos] = piece;
        newBoard[from] = '_';
        setBoard(newBoard);
        setLastMove({ from, to: pos });

        setBoardLocked(true);
        setSelectedPiece(null);
        setValidDestinations([]);

        try {
            await checkersMove(from, pos);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
                setBoard(prevBoard);
                setBoardLocked(false);
            }
        }
    };

    const handleNewGame = () => {
        closeSSE();
        clearHint();
        setSessionId(null);
        setPendingResume(null);
        setWinner(null);
        setLastMove(null);
        setStatusText('');
        setSelectedPiece(null);
        setValidDestinations([]);
        setMustCapture(null);
        setLegalPieces([]);
        setBoardLocked(true);
        setPhase('newgame');
    };

    const handleResign = () => {
        closeSSE();
        clearHint();
        if (sessionId) forfeitGame('checkers', sessionId).catch(() => {});
        setWinner('ai');
        setBoardLocked(true);
        setPhase('terminal');
    };

    const flipped = !playerStarts;
    const showSymbols = phase === 'resumeprompt' || phase === 'playing' || phase === 'terminal';
    const showSidePanel = phase === 'playing' || phase === 'terminal';

    const playerLabel = playerSymbol === 'R' ? 'Red' : 'Black';
    const aiLabel = aiSymbol === 'R' ? 'Red' : 'Black';

    const playerResult: 'win' | 'loss' | 'draw' | null =
        phase === 'terminal' && winner !== null ? (winner === 'player' ? 'win' : 'loss') : null;

    const aiResult: 'win' | 'loss' | 'draw' | null =
        playerResult === null ? null : playerResult === 'win' ? 'loss' : 'win';

    const playerPiecesOnBoard = board.filter(p => p !== '_' && p.toUpperCase() === playerSymbol).length;
    const aiPiecesOnBoard = board.filter(p => p !== '_' && p.toUpperCase() === aiSymbol).length;
    const playerCaptures = showSidePanel ? 12 - aiPiecesOnBoard : 0;
    const aiCaptures = showSidePanel ? 12 - playerPiecesOnBoard : 0;

    const isPlayerRed = playerSymbol === 'R';
    const isAiRed = aiSymbol === 'R';

    if (authLoading) {
        return (
            <div className='container mx-auto px-4 py-10 flex justify-center'>
                <PageMeta title='Checkers' description='Play Checkers against an AI opponent.' noindex />
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='container mx-auto px-4 py-10'>
                <PageMeta title='Checkers' description='Play Checkers against an AI opponent.' noindex />
                <h1 className='mb-6 text-4xl font-bold text-center'>Checkers</h1>
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
            <PageMeta title='Checkers' description='Play Checkers against an AI opponent.' noindex />
            <GameLayout
                aspect={1}
                board={
                    <div className='relative h-full w-full'>
                        <CheckersBoard
                            board={board}
                            playerSymbol={playerSymbol}
                            currentTurn={currentTurn}
                            selectedPiece={selectedPiece}
                            validDestinations={validDestinations}
                            legalPieces={legalPieces}
                            mustCapture={mustCapture}
                            locked={
                                boardLocked || phase === 'terminal' || phase === 'newgame' || phase === 'resumeprompt'
                            }
                            flipped={flipped}
                            lastMove={lastMove}
                            hidePieces={phase !== 'playing'}
                            onPieceClick={handlePieceClick}
                            onPieceDragStart={handlePieceDragStart}
                            onSquareClick={handleSquareClick}
                            onSquareDrop={handleSquareClick}
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
                                optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                                optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                            />
                        )}

                        {phase === 'terminal' && !showGameOverOverlay && (
                            <div className='absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-base-100/90 backdrop-blur-sm'>
                                <p className='text-2xl font-bold'>{playerResult === 'win' ? 'You Win!' : 'You Lose'}</p>
                            </div>
                        )}

                        {phase === 'terminal' && showGameOverOverlay && (
                            <GameStartOverlay
                                title={playerResult === 'win' ? 'You Win!' : 'You Lose'}
                                canResume={false}
                                onResume={() => {}}
                                optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                                optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                            />
                        )}
                    </div>
                }
                opponent={
                    <PlayerCard
                        name='AI Opponent'
                        isAi
                        symbol={showSymbols ? aiLabel : undefined}
                        statusText={phase === 'playing' ? statusText : undefined}
                        result={aiResult}
                    />
                }
                player={
                    <PlayerCard
                        name={user.displayName}
                        avatarUrl={user.profilePicture}
                        symbol={showSymbols ? playerLabel : undefined}
                        result={playerResult}
                    />
                }
                controls={
                    <>
                        {showSidePanel && (
                            <div className='flex w-full flex-col items-center gap-2'>
                                <div className='flex min-h-5 flex-wrap justify-center gap-1'>
                                    {Array.from({ length: aiCaptures }, (_, i) => (
                                        <div
                                            key={i}
                                            className={`h-4 w-4 rounded-full border ${isPlayerRed ? 'bg-red-500 border-red-700' : 'bg-neutral-800 border-neutral-600'}`}
                                        />
                                    ))}
                                </div>
                                <div className='h-px w-full bg-base-content/20' />
                                <div className='flex min-h-5 flex-wrap justify-center gap-1'>
                                    {Array.from({ length: playerCaptures }, (_, i) => (
                                        <div
                                            key={i}
                                            className={`h-4 w-4 rounded-full border ${isAiRed ? 'bg-red-500 border-red-700' : 'bg-neutral-800 border-neutral-600'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {phase === 'playing' && currentTurn === 'player' && (
                            <div className='animate-pulse text-center text-sm font-semibold text-primary'>
                                {mustCapture !== null ? 'Your turn — capture required' : 'Your turn'}
                            </div>
                        )}

                        {phase === 'playing' && (
                            <NewGameButtons
                                className='flex flex-wrap justify-center gap-2'
                                optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                                optionB={{ label: 'Play as Black', onClick: () => handleStartGame(false) }}
                                onResign={handleResign}
                            />
                        )}

                        <GameStatsPanel gameType='checkers' />
                    </>
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
