import PageMeta from '../../components/PageMeta';

export default function PongPage() {
    return (
        <div className='container mx-auto px-4 py-10'>
            <PageMeta title="Pong" description="Play real-time Pong against an AI opponent." noindex />
            <h1 className='mb-2 text-4xl font-bold'>Pong</h1>
            <p className='opacity-60'>Game implementation coming in Phase 3.</p>
        </div>
    );
}
