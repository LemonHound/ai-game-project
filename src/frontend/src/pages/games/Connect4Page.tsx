import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStatsPanel from '../../components/games/GameStatsPanel';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import NewGameButtons from '../../components/games/NewGameButtons';
import PlayerCard from '../../components/PlayerCard';
import Connect4Board from '../../components/games/Connect4Board';
import { useAuth } from '../../hooks/useAuth';
import { c4Move, c4NewGame, c4Resume, c4SubscribeSSE, type C4GameState } from '../../api/connect4';
import { forfeitGame } from '../../api/games';
import PageMeta from '../../components/PageMeta';

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

/**
 * Renders the full Connect 4 game page, managing game state, SSE moves, and session persistence.
 */
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
    const [lastDrop, setLastDrop] = useState<[number, number] | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{ sessionId: string; state: C4GameState } | null>(null);
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
            const es = c4SubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onMove: data => {
                    if (data.board) setBoard(data.board);
                    if (data.winning_cells !== undefined) setWinningCells(data.winning_cells);
                    if (data.current_turn) setCurrentTurn(data.current_turn);
                    if (data.row !== null && data.row !== undefined && data.col !== null && data.col !== undefined) {
                        setLastDrop([data.row, data.col]);
                    }

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
            const { id, state } = await c4Resume();
            if (id && state) {
                setHint();
                if (!state.game_active) {
                    setBoard(state.board);
                    setCurrentTurn(state.current_turn ?? 'player');
                    setPlayerStarts(state.player_starts);
                    setSessionId(id);
                    setBoardLocked(true);
                    setPhase('terminal');
                } else {
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
        setCurrentTurn(state.current_turn ?? 'player');
        setWinningCells(null);
        setWinner(null);
        setPlayerStarts(state.player_starts);
        if (state.last_move) setLastDrop([state.last_move.row, state.last_move.col]);
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
        setBoard(emptyBoard());
        setWinningCells(null);
        setWinner(null);
        setLastDrop(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { id, state } = await c4NewGame(goFirst);
            setSessionId(id);
            setBoard(state.board);
            setCurrentTurn(state.current_turn ?? 'player');
            setPlayerStarts(state.player_starts);
            if (state.last_move) setLastDrop([state.last_move.row, state.last_move.col]);
            setBoardLocked(state.current_turn === 'ai');
            setHint();
            subscribeSSE(id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const handleColumnClick = async (col: number) => {
        if (boardLocked || currentTurn !== 'player' || board[0][col] !== null) return;

        let landingRow = -1;
        for (let r = 5; r >= 0; r--) {
            if (board[r][col] === null) {
                landingRow = r;
                break;
            }
        }
        if (landingRow === -1) return;

        const newBoard = board.map(r => [...r]);
        newBoard[landingRow][col] = 'player';
        setBoard(newBoard);
        setLastDrop([landingRow, col]);
        setCurrentTurn('ai');
        setBoardLocked(true);
        setStatusText('');

        try {
            await c4Move(col);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) {
                setShowAuthModal(true);
            } else {
                setBoard(board);
                setCurrentTurn('player');
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
        setLastDrop(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('newgame');
    };

    const handleResign = () => {
        closeSSE();
        clearHint();
        if (sessionId) forfeitGame('connect4', sessionId).catch(() => {});
        setWinner('ai');
        setBoardLocked(true);
        setPhase('terminal');
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
                <PageMeta title='Connect 4' description='Drop pieces and outsmart the AI in Connect 4.' noindex />
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='container mx-auto px-4 py-10'>
                <PageMeta title='Connect 4' description='Drop pieces and outsmart the AI in Connect 4.' noindex />
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

    void sessionId;

    return (
        <div className='container mx-auto px-4 py-6 max-w-lg'>
            <PageMeta title='Connect 4' description='Drop pieces and outsmart the AI in Connect 4.' noindex />
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
                    lastDrop={lastDrop}
                    onColumnClick={handleColumnClick}
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
                        optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                        optionB={{ label: 'Play as Yellow', onClick: () => handleStartGame(false) }}
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
                        optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                        optionB={{ label: 'Play as Yellow', onClick: () => handleStartGame(false) }}
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
                    optionA={{ label: 'Play as Red', onClick: () => handleStartGame(true) }}
                    optionB={{ label: 'Play as Yellow', onClick: () => handleStartGame(false) }}
                    onResign={handleResign}
                />
            )}

            <GameStatsPanel gameType='connect4' />

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
