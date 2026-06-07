import { useEffect, useState } from 'react';
import { fetchChessEngines, type ChessEngineGroup } from '../../api/chess';

interface ChessEngineSelectProps {
    onChange: (engineVersionId: number | null) => void;
}

export default function ChessEngineSelect({ onChange }: ChessEngineSelectProps) {
    const [groups, setGroups] = useState<ChessEngineGroup[]>([]);
    const [model, setModel] = useState<string>('');
    const [versionId, setVersionId] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        fetchChessEngines()
            .then(data => {
                if (!active) return;
                setGroups(data);
                if (data.length > 0) {
                    setModel(data[0].difficulty);
                }
            })
            .catch(() => setGroups([]));
        return () => {
            active = false;
        };
    }, []);

    const current = groups.find(g => g.difficulty === model);

    useEffect(() => {
        const first = current?.versions[0]?.id ?? null;
        setVersionId(first);
        onChange(first);
    }, [model, groups]);

    if (groups.length === 0) return null;

    return (
        <div className='flex flex-col gap-2 w-full max-w-xs px-4'>
            <label className='flex flex-col text-xs uppercase tracking-wider text-base-content/50'>
                Model
                <select
                    className='select select-bordered select-sm'
                    aria-label='Model'
                    value={model}
                    onChange={e => setModel(e.target.value)}>
                    {groups.map(g => (
                        <option key={g.difficulty} value={g.difficulty}>
                            {g.difficulty}
                        </option>
                    ))}
                </select>
            </label>
            <label className='flex flex-col text-xs uppercase tracking-wider text-base-content/50'>
                Version
                <select
                    className='select select-bordered select-sm'
                    aria-label='Version'
                    value={versionId ?? ''}
                    onChange={e => {
                        const id = Number(e.target.value);
                        setVersionId(id);
                        onChange(id);
                    }}>
                    {(current?.versions ?? []).map(v => (
                        <option key={v.id} value={v.id}>
                            {v.version}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
