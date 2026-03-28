import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import PlayerCard from '../../components/PlayerCard';
import Connect4Board from '../../components/games/Connect4Board';
import { useAuth } from '../../hooks/useAuth';
import { c4Move, c4NewGame, c4Resume, c4SubscribeSSE, type C4GameState } from '../../api/connect4';

const HINT_KEY = 'c4_game_hint';
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

function emptyBoard(): ('player' | 'ai' | null)[][] {
    return Array.from({ length: 6 }, () => Array(7).fill(null));
}

export default function Connect4Page() {
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [board, setBoard] = useState<('player' | 'ai' | null)[][]>(emptyBoard());
    const [winningCells, setWinningCells] = useState<[number, number][] | null>(null);
    const [winner, setWinner] = useState<'player' | 'ai' | 'draw' | null>(null);
    const [currentTurn, setCurrentTurn] = useState<'player' | 'ai'>('player');
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [playerStarts, setPlayerStarts] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{ sessionId: string; state: C4GameState } | null>(null);

    const esRef = useRef<EventSource | null>(null);

    const closeSSE = useCallback(() => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    }, []);

    const subscribeSSE = useCallback(
        (sid: string) => {
            closeSSE();
            const es = c4SubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onMove: data => {
                    if (data.board) setBoard(data.board);
                    if (data.winning_cells !== undefined) setWinningCells(data.winning_cells);
                    if (data.current_turn) setCurrentTurn(data.current_turn);

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
        [closeSSE]
    );

    const loadSession = useCallback(async () => {
        if (!user) return;
        try {
            const { session_id, state } = await c4Resume();
            if (session_id && state) {
                setBoard(state.board);
                setCurrentTurn(state.current_turn ?? 'player');
                setWinningCells(null);
                setWinner(null);
                setPlayerStarts(state.player_starts);
                setHint();
                if (!state.game_active) {
                    setSessionId(session_id);
                    setBoardLocked(true);
                    setPhase('terminal');
                } else {
                    setPendingResume({ sessionId: session_id, state });
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

    const handleResume = () => {
        if (!pendingResume) return;
        setSessionId(pendingResume.sessionId);
        setBoardLocked(pendingResume.state.current_turn === 'ai');
        setPhase('playing');
        subscribeSSE(pendingResume.sessionId);
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
        setWinningCells(null);
        setWinner(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { session_id, state } = await c4NewGame(goFirst);
            setSessionId(session_id);
            setBoard(state.board);
            setCurrentTurn(state.current_turn ?? 'player');
            setPlayerStarts(state.player_starts);
            setBoardLocked(state.current_turn === 'ai');
            setHint();
            subscribeSSE(session_id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const handleColumnClick = async (col: number) => {
        if (boardLocked || currentTurn !== 'player' || board[0][col] !== null) return;

        setBoardLocked(true);
        setStatusText('');

        try {
            await c4Move(col);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
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
        setStatusText('');
        setBoardLocked(true);
        setPhase('newgame');
    };

    const playerSymbol = playerStarts ? 'Red' : 'Yellow';
    const aiSymbol = playerStarts ? 'Yellow' : 'Red';
    const showSymbols = phase === 'resumeprompt' || phase === 'playing' || phase === 'terminal';

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
                <h1 className='mb-6 text-4xl font-bold text-center'>Connect 4</h1>
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

    return (
        <div className='container mx-auto px-4 py-6 max-w-lg'>
            <h1 className='mb-4 text-4xl font-bold text-center'>Connect 4</h1>

            <PlayerCard
                name='AI Opponent'
                isAi
                symbol={showSymbols ? aiSymbol : undefined}
                statusText={phase === 'playing' ? statusText : undefined}
                result={aiResult}
            />

            <div className='relative my-4'>
                <Connect4Board
                    board={board}
                    playerStarts={playerStarts}
                    currentTurn={currentTurn}
                    locked={boardLocked || phase === 'terminal' || phase === 'newgame' || phase === 'resumeprompt'}
                    winningCells={winningCells}
                    onColumnClick={handleColumnClick}
                />

                {phase === 'loading' && (
                    <div className='absolute inset-0 flex items-center justify-center rounded-lg bg-base-100/80'>
                        <span className='loading loading-spinner loading-lg' />
                    </div>
                )}

                {phase === 'resumeprompt' && (
                    <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-base-100/80 backdrop-blur-sm'>
                        <p className='text-sm text-base-content/70 font-medium'>Game in progress</p>
                        <div className='flex flex-col gap-3 w-full max-w-xs px-4'>
                            <button className='btn btn-primary btn-wide' onClick={handleResume}>
                                Continue Game
                            </button>
                            <button className='btn btn-neutral btn-wide' onClick={handleNewGame}>
                                New Game
                            </button>
                        </div>
                    </div>
                )}

                {phase === 'newgame' && (
                    <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-base-100/80 backdrop-blur-sm'>
                        <p className='text-sm text-base-content/70'>Choose your side:</p>
                        <div className='flex flex-col gap-3 w-full max-w-xs px-4'>
                            <button className='btn btn-primary btn-wide' onClick={() => handleStartGame(true)}>
                                Play as Red — Go First
                            </button>
                            <button className='btn btn-secondary btn-wide' onClick={() => handleStartGame(false)}>
                                Play as Yellow — Go Second
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <PlayerCard
                name={user.displayName || user.username}
                avatarUrl={user.profilePicture}
                symbol={showSymbols ? playerSymbol : undefined}
                result={playerResult}
            />

            {(phase === 'playing' || phase === 'terminal') && (
                <div className='flex justify-center mt-4'>
                    <button className='btn btn-neutral btn-sm' onClick={handleNewGame}>
                        New Game
                    </button>
                </div>
            )}

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
