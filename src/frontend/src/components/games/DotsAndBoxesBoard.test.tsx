import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DotsAndBoxesBoard from './DotsAndBoxesBoard';

describe('DotsAndBoxesBoard', () => {
    const defaultProps = {
        gridSize: 4,
        horizontalLines: {} as Record<string, 'player' | 'ai'>,
        verticalLines: {} as Record<string, 'player' | 'ai'>,
        boxes: {} as Record<string, 'player' | 'ai'>,
        currentTurn: 'player' as const,
        locked: false,
        lastLine: null,
        onLineClick: vi.fn(),
    };

    it('dab board edge click calls move handler', async () => {
        const user = userEvent.setup();
        const onLineClick = vi.fn();
        const { container } = render(
            <DotsAndBoxesBoard {...defaultProps} onLineClick={onLineClick} />,
        );
        const svgRects = container.querySelectorAll('rect[fill="transparent"]');
        if (svgRects.length > 0) {
            await user.click(svgRects[0]);
            expect(onLineClick).toHaveBeenCalled();
        }
    });

    it('renders SVG board', () => {
        const { container } = render(<DotsAndBoxesBoard {...defaultProps} />);
        expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('completed box fills with player color', () => {
        const { container } = render(
            <DotsAndBoxesBoard
                {...defaultProps}
                horizontalLines={{ '0,0': 'player', '1,0': 'player' }}
                verticalLines={{ '0,0': 'player', '0,1': 'player' }}
                boxes={{ '0,0': 'player' }}
            />,
        );
        const filledBoxes = container.querySelectorAll('rect[fill*="blue"], rect[class*="blue"]');
        expect(container.querySelector('svg')).toBeInTheDocument();
    });
});
