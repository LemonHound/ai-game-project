import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStatsPanel from '../../components/games/GameStatsPanel';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import NewGameButtons from '../../components/games/NewGameButtons';
import PlayerCard from '../../components/PlayerCard';
import TicTacToeBoard from '../../components/games/TicTacToeBoard';
import { useAuth } from '../../hooks/useAuth';
import { tttMove, tttNewGame, tttResume, tttSubscribeSSE, type TttGameState } from '../../api/ttt';
import { forfeitGame } from '../../api/games';
import PageMeta from '../../components/PageMeta';

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

type Phase = 'loading' | 'newgame' | 'resumeprompt' | 'playing' | 'terminal';

/**
 * Renders the full Tic-Tac-Toe game page, managing game state, SSE moves, and session persistence.
 */
export default function TicTacToePage() {
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
    const [winningPositions, setWinningPositions] = useState<number[] | null>(null);
    const [lastPosition, setLastPosition] = useState<number | null>(null);
    const [winner, setWinner] = useState<string | null>(null);
    const [currentTurn, setCurrentTurn] = useState<'player' | 'ai'>('player');
    const [statusText, setStatusText] = useState<string>('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [playerSymbol, setPlayerSymbol] = useState<string>('X');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{ sessionId: string; state: TttGameState } | null>(null);
    const [showGameOverOverlay, setShowGameOverOverlay] = useState(false);

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
                    if (data.position !== null && data.position !== undefined) setLastPosition(data.position);

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
            const { id, state } = await tttResume();
            if (id && state) {
                setPlayerSymbol(state.player_symbol);
                setHint();
                if (state.status === 'complete') {
                    setBoard(state.board);
                    setCurrentTurn(state.current_turn);
                    setWinningPositions(state.winning_positions);
                    setWinner(state.winner);
                    setSessionId(id);
                    setBoardLocked(true);
                    setPhase('terminal');
                } else {
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
        setSessionId(pendingResume.sessionId);
        setBoard(pendingResume.state.board);
        setCurrentTurn(pendingResume.state.current_turn);
        setWinningPositions(pendingResume.state.winning_positions);
        setWinner(pendingResume.state.winner);
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
        setBoard(Array(9).fill(null));
        setWinningPositions(null);
        setLastPosition(null);
        setWinner(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { id, state } = await tttNewGame(goFirst);
            setSessionId(id);
            setBoard(state.board);
            setCurrentTurn(state.current_turn);
            setPlayerSymbol(state.player_symbol);
            setBoardLocked(state.current_turn === 'ai');
            setHint();
            subscribeSSE(id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const handleCellClick = async (index: number) => {
        if (boardLocked || currentTurn !== 'player' || board[index] !== null) return;

        setBoardLocked(true);
        setLastPosition(index);
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
                setLastPosition(null);
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
        setLastPosition(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('newgame');
    };

    const handleResign = () => {
        closeSSE();
        clearHint();
        if (sessionId) forfeitGame('tic-tac-toe', sessionId).catch(() => {});
        setWinner(playerSymbol === 'X' ? 'O' : 'X');
        setBoardLocked(true);
        setPhase('terminal');
    };

    const aiSymbol = playerSymbol === 'X' ? 'O' : 'X';
    const showSymbols = phase === 'resumeprompt' || phase === 'playing' || phase === 'terminal';

    const playerResult: 'win' | 'loss' | 'draw' | null =
        phase === 'terminal' && winner !== null
            ? winner === 'draw'
                ? 'draw'
                : winner === playerSymbol
                  ? 'win'
                  : 'loss'
            : null;

    const aiResult: 'win' | 'loss' | 'draw' | null =
        playerResult === null ? null : playerResult === 'draw' ? 'draw' : playerResult === 'win' ? 'loss' : 'win';

    if (authLoading) {
        return (
            <div className='container mx-auto px-4 py-10 flex justify-center'>
                <PageMeta
                    title='Tic Tac Toe'
                    description='Play Tic Tac Toe against an AI that adapts to your strategy.'
                    noindex
                />
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='container mx-auto px-4 py-10'>
                <PageMeta
                    title='Tic Tac Toe'
                    description='Play Tic Tac Toe against an AI that adapts to your strategy.'
                    noindex
                />
                <h1 className='mb-6 text-4xl font-bold text-center'>Tic-Tac-Toe</h1>
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
        <div className='container mx-auto px-4 py-6 max-w-lg'>
            <PageMeta
                title='Tic Tac Toe'
                description='Play Tic Tac Toe against an AI that adapts to your strategy.'
                noindex
            />
            <h1 className='mb-4 text-4xl font-bold text-center'>Tic-Tac-Toe</h1>

            <PlayerCard
                name='AI Opponent'
                isAi
                symbol={showSymbols ? aiSymbol : undefined}
                statusText={phase === 'playing' ? statusText : undefined}
                result={aiResult}
            />

            <div className='relative my-4'>
                <TicTacToeBoard
                    board={board}
                    winningPositions={winningPositions}
                    lastPosition={lastPosition}
                    locked={boardLocked || phase === 'terminal' || phase === 'newgame' || phase === 'resumeprompt'}
                    onCellClick={handleCellClick}
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
                        optionA={{ label: 'Play as X', onClick: () => handleStartGame(true) }}
                        optionB={{ label: 'Play as O', onClick: () => handleStartGame(false) }}
                    />
                )}

                {phase === 'terminal' && !showGameOverOverlay && (
                    <div className='absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-base-100/90 backdrop-blur-sm'>
                        <p className='text-2xl font-bold'>
                            {playerResult === 'win' ? 'You Win!' : playerResult === 'loss' ? 'You Lose' : 'Draw!'}
                        </p>
                    </div>
                )}

                {phase === 'terminal' && showGameOverOverlay && (
                    <GameStartOverlay
                        title={playerResult === 'win' ? 'You Win!' : playerResult === 'loss' ? 'You Lose' : 'Draw!'}
                        canResume={false}
                        onResume={() => {}}
                        optionA={{ label: 'Play as X', onClick: () => handleStartGame(true) }}
                        optionB={{ label: 'Play as O', onClick: () => handleStartGame(false) }}
                    />
                )}
            </div>

            <PlayerCard
                name={user.displayName || user.username}
                avatarUrl={user.profilePicture}
                symbol={showSymbols ? playerSymbol : undefined}
                result={playerResult}
            />

            {phase === 'playing' && (
                <NewGameButtons
                    className='flex justify-center mt-4'
                    optionA={{ label: 'Play as X', onClick: () => handleStartGame(true) }}
                    optionB={{ label: 'Play as O', onClick: () => handleStartGame(false) }}
                    onResign={handleResign}
                />
            )}

            <GameStatsPanel gameType='tic_tac_toe' />

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
