import { formatEval, whiteFill, type WhiteScore } from '../../lib/evalScore';

interface EvalBarProps {
    cp: number | null;
    mate: number | null;
    perspective: 'white' | 'black';
}

const EvalBar = ({ cp, mate, perspective }: EvalBarProps) => {
    const score: WhiteScore = { cp, mate };
    const whitePct = Math.round(whiteFill(score) * 100);
    const label = formatEval(score);
    return (
        <div
            data-testid='eval-bar'
            className='relative w-5 self-stretch overflow-hidden rounded bg-neutral'
            style={{ display: 'flex', flexDirection: perspective === 'white' ? 'column-reverse' : 'column' }}>
            <div
                data-testid='eval-bar-white'
                className='w-full bg-white transition-[height] duration-300'
                style={{ height: `${whitePct}%` }}
            />
            <span className='pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] font-semibold text-white mix-blend-difference'>
                {label}
            </span>
        </div>
    );
};

export default EvalBar;
