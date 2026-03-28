import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import TicTacToeBoard from '../../components/games/TicTacToeBoard';
import { useAuth } from '../../hooks/useAuth';
import { tttMove, tttNewGame, tttResume, tttSubscribeSSE, type TttGameState } from '../../api/ttt';

const HINT_KEY = 'ttt_game_hint';
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

type Phase = 'loading' | 'newgame' | 'playing' | 'terminal';

export default function TicTacToePage() {
    const { user, loading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
    const [winningPositions, setWinningPositions] = useState<number[] | null>(null);
    const [winner, setWinner] = useState<string | null>(null);
    const [currentTurn, setCurrentTurn] = useState<'player' | 'ai'>('player');
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [playerStarts, setPlayerStarts] = useState(true);
    const [playerSymbol, setPlayerSymbol] = useState<string>('X');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

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
            const es = tttSubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onMove: data => {
                    if (data.board) setBoard(data.board);
                    if (data.winning_positions !== undefined) setWinningPositions(data.winning_positions);
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
            const { session_id, state } = await tttResume();
            if (session_id && state) {
                setSessionId(session_id);
                setBoard(state.board);
                setCurrentTurn(state.current_turn);
                setWinningPositions(state.winning_positions);
                setWinner(state.winner);
                setPlayerSymbol(state.player_symbol);
                setHint();
                if (state.status === 'complete') {
                    setPhase('terminal');
                    setBoardLocked(true);
                } else {
                    setPhase('playing');
                    setBoardLocked(state.current_turn === 'ai');
                    subscribeSSE(session_id);
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
    }, [user, subscribeSSE]);

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

    const handleStartGame = async () => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        clearHint();
        try {
            const { session_id, state } = await tttNewGame(playerStarts);
            setSessionId(session_id);
            setBoard(state.board);
            setCurrentTurn(state.current_turn);
            setWinningPositions(null);
            setWinner(null);
            setPlayerSymbol(state.player_symbol);
            setBoardLocked(state.current_turn === 'ai');
            setStatusText('');
            setPhase('playing');
            setHint();
            subscribeSSE(session_id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
        }
    };

    const handleCellClick = async (index: number) => {
        if (boardLocked || currentTurn !== 'player' || board[index] !== null) return;

        setBoardLocked(true);
        const optimistic = board.slice();
        optimistic[index] = playerSymbol;
        setBoard(optimistic);
        setStatusText('');

        try {
            await tttMove(index);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
                setBoard(board);
                setBoardLocked(false);
            }
        }
    };

    const handleNewGame = () => {
        closeSSE();
        clearHint();
        setSessionId(null);
        setBoard(Array(9).fill(null));
        setWinningPositions(null);
        setWinner(null);
        setCurrentTurn('player');
        setStatusText('');
        setBoardLocked(false);
        setPhase('newgame');
    };

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
                <h1 className='mb-6 text-4xl font-bold'>Tic-Tac-Toe</h1>
                <div className='card bg-base-200 max-w-sm'>
                    <div className='card-body text-center'>
                        <p className='mb-4'>Sign in to play.</p>
                        <button className='btn btn-primary' onClick={() => setShowAuthModal(true)}>
                            Sign In
                        </button>
                    </div>
                </div>
                {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
            </div>
        );
    }

    return (
        <div className='container mx-auto px-4 py-6 max-w-lg'>
            <h1 className='mb-4 text-4xl font-bold text-center'>Tic-Tac-Toe</h1>

            {phase === 'loading' && (
                <div className='flex justify-center py-20'>
                    <span className='loading loading-spinner loading-lg' />
                </div>
            )}

            {phase === 'newgame' && (
                <div className='flex flex-col items-center gap-6 py-10'>
                    <p className='text-base-content/70'>Choose who goes first:</p>
                    <div className='join'>
                        <button
                            className={`btn join-item ${playerStarts ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setPlayerStarts(true)}>
                            Go first (X)
                        </button>
                        <button
                            className={`btn join-item ${!playerStarts ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setPlayerStarts(false)}>
                            Go second (O)
                        </button>
                    </div>
                    <button className='btn btn-primary btn-wide' onClick={handleStartGame}>
                        New Game
                    </button>
                </div>
            )}

            {(phase === 'playing' || phase === 'terminal') && (
                <div className='flex flex-col items-center gap-4'>
                    <TicTacToeBoard
                        board={board}
                        winningPositions={winningPositions}
                        locked={boardLocked || phase === 'terminal'}
                        onCellClick={handleCellClick}
                    />

                    <div className='min-h-8 text-center'>
                        {phase === 'terminal' ? (
                            <div className='alert max-w-xs'>
                                <span>
                                    {winner === 'draw'
                                        ? "It's a draw!"
                                        : winner === playerSymbol
                                          ? 'You win!'
                                          : 'AI wins!'}
                                </span>
                            </div>
                        ) : statusText ? (
                            <div className='flex items-center gap-2 text-base-content/70'>
                                <span className='loading loading-dots loading-sm' />
                                <span>{statusText}</span>
                            </div>
                        ) : null}
                    </div>

                    <button className='btn btn-outline btn-sm' onClick={handleNewGame}>
                        New Game
                    </button>
                </div>
            )}

            {showAuthModal && (
                <AuthModal
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
