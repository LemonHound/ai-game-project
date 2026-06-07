import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChessEngineSelect from './ChessEngineSelect';
import * as api from '../../api/chess';

afterEach(() => vi.restoreAllMocks());

describe('ChessEngineSelect', () => {
    it('loads engines and reports the selected version id', async () => {
        vi.spyOn(api, 'fetchChessEngines').mockResolvedValue([
            { difficulty: 'cnn', versions: [{ id: 5, version: '1.0.0', class_count: 1, created_at: '' }] },
        ]);
        const onChange = vi.fn();
        render(<ChessEngineSelect onChange={onChange} />);
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(5));
        expect(screen.getByLabelText('Model')).toBeInTheDocument();
        expect(screen.getByLabelText('Version')).toBeInTheDocument();
    });
});
