import { useCallback, useEffect, useRef, useState } from 'react';
import AuthModal from '../../components/AuthModal';
import GameStartOverlay from '../../components/games/GameStartOverlay';
import PlayerCard from '../../components/PlayerCard';
import DotsAndBoxesBoard from '../../components/games/DotsAndBoxesBoard';
import { useAuth } from '../../hooks/useAuth';
import { dabMove, dabNewGame, dabResume, dabSubscribeSSE, type DaBGameState } from '../../api/dab';

const HINT_KEY = 'dab_game_hint';
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

export default function DotsAndBoxesPage() {
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>(getHint() ? 'loading' : 'newgame');
    const [horizontalLines, setHorizontalLines] = useState<Record<string, 'player' | 'ai'>>({});
    const [verticalLines, setVerticalLines] = useState<Record<string, 'player' | 'ai'>>({});
    const [boxes, setBoxes] = useState<Record<string, 'player' | 'ai'>>({});
    const [playerScore, setPlayerScore] = useState(0);
    const [aiScore, setAiScore] = useState(0);
    const [currentTurn, setCurrentTurn] = useState<'player' | 'ai' | null>(null);
    const [winner, setWinner] = useState<'player' | 'ai' | 'draw' | null>(null);
    const [statusText, setStatusText] = useState('');
    const [boardLocked, setBoardLocked] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<{
        sessionId: string;
        state: DaBGameState;
    } | null>(null);

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
            const es = dabSubscribeSSE(sid, {
                onStatus: msg => setStatusText(msg),
                onMove: data => {
                    if (data.horizontal_lines !== undefined) setHorizontalLines(data.horizontal_lines ?? {});
                    if (data.vertical_lines !== undefined) setVerticalLines(data.vertical_lines ?? {});
                    if (data.boxes !== undefined) setBoxes(data.boxes ?? {});
                    if (data.player_score !== undefined) setPlayerScore(data.player_score ?? 0);
                    if (data.ai_score !== undefined) setAiScore(data.ai_score ?? 0);
                    if (data.current_turn !== undefined) setCurrentTurn(data.current_turn ?? null);
                    setHint();
                    if (data.status === 'complete') {
                        setWinner(data.winner ?? null);
                        setBoardLocked(true);
                        setPhase('terminal');
                        clearHint();
                        closeSSE();
                    } else {
                        setBoardLocked(false);
                        setStatusText('');
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
            const { session_id, state } = await dabResume();
            if (session_id && state) {
                setHorizontalLines(state.horizontal_lines);
                setVerticalLines(state.vertical_lines);
                setBoxes(state.boxes);
                setPlayerScore(state.player_score);
                setAiScore(state.ai_score);
                setCurrentTurn(state.current_turn);
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
        setHorizontalLines({});
        setVerticalLines({});
        setBoxes({});
        setPlayerScore(0);
        setAiScore(0);
        setCurrentTurn(null);
        setWinner(null);
        setStatusText('');
        setBoardLocked(true);
        setPhase('playing');
        try {
            const { session_id, state } = await dabNewGame(goFirst);
            setSessionId(session_id);
            setHorizontalLines(state.horizontal_lines);
            setVerticalLines(state.vertical_lines);
            setBoxes(state.boxes);
            setPlayerScore(state.player_score);
            setAiScore(state.ai_score);
            setCurrentTurn(state.current_turn);
            setBoardLocked(state.current_turn === 'ai');
            setHint();
            subscribeSSE(session_id);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            setPhase('newgame');
        }
    };

    const handleLineClick = async (type: 'horizontal' | 'vertical', row: number, col: number) => {
        if (boardLocked || currentTurn !== 'player') return;
        const key = `${row},${col}`;
        if (type === 'horizontal' && horizontalLines[key]) return;
        if (type === 'vertical' && verticalLines[key]) return;

        setBoardLocked(true);
        setStatusText('');
        try {
            await dabMove(type, row, col);
        } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 401) setShowAuthModal(true);
            else setBoardLocked(false);
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

    const showScores = phase === 'resumeprompt' || phase === 'playing' || phase === 'terminal';

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
                <h1 className='mb-6 text-4xl font-bold text-center'>Dots and Boxes</h1>
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
            <h1 className='mb-4 text-4xl font-bold text-center'>Dots and Boxes</h1>

            <PlayerCard
                name='AI Opponent'
                isAi
                symbol={showScores ? String(aiScore) : undefined}
                statusText={phase === 'playing' ? statusText : undefined}
                result={aiResult}
            />

            <div className='relative my-4 flex justify-center'>
                <DotsAndBoxesBoard
                    gridSize={4}
                    horizontalLines={horizontalLines}
                    verticalLines={verticalLines}
                    boxes={boxes}
                    currentTurn={currentTurn}
                    locked={boardLocked || phase === 'terminal' || phase === 'newgame' || phase === 'resumeprompt'}
                    onLineClick={handleLineClick}
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
                        optionA={{ label: 'Go First', onClick: () => handleStartGame(true) }}
                        optionB={{ label: 'Go Second', onClick: () => handleStartGame(false) }}
                    />
                )}

                {phase === 'terminal' && (
                    <div className='absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg bg-base-100/85 backdrop-blur-sm'>
                        <p className='text-2xl font-bold'>
                            {playerResult === 'win' ? 'You Win!' : playerResult === 'loss' ? 'You Lose' : 'Draw!'}
                        </p>
                        <div className='flex flex-col items-center gap-2 w-full max-w-xs px-4'>
                            <div className='flex items-center gap-2 w-full'>
                                <div className='flex-1 h-px bg-base-content/20' />
                                <span className='text-xs text-base-content/50 uppercase tracking-wider'>
                                    Play Again
                                </span>
                                <div className='flex-1 h-px bg-base-content/20' />
                            </div>
                            <div className='flex gap-2 w-full'>
                                <button className='btn btn-primary flex-1' onClick={() => handleStartGame(true)}>
                                    Go First
                                </button>
                                <button className='btn btn-secondary flex-1' onClick={() => handleStartGame(false)}>
                                    Go Second
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <PlayerCard
                name={user.displayName || user.username}
                avatarUrl={user.profilePicture}
                symbol={showScores ? String(playerScore) : undefined}
                result={playerResult}
            />

            {phase === 'playing' && (
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
