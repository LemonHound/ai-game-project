/**
 * Block placeholder for loading states. Uses DaisyUI `skeleton` styling.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
    return <div className={`skeleton ${className}`.trim()} />;
}

/**
 * A row of shimmering blocks sized for compact stat summaries.
 */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonBlock key={i} className='h-24 w-full rounded-box' />
            ))}
        </div>
    );
}

/**
 * Placeholder cards for game grids while the games list loads.
 */
export function GameCardGridSkeleton({ cards = 6 }: { cards?: number }) {
    return (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className='card bg-base-200 shadow-md'>
                    <div className='card-body gap-3'>
                        <SkeletonBlock className='h-10 w-10 rounded-lg' />
                        <SkeletonBlock className='h-6 w-2/3' />
                        <SkeletonBlock className='h-4 w-full' />
                        <SkeletonBlock className='h-4 w-5/6' />
                        <div className='mt-2 flex flex-wrap gap-2'>
                            <SkeletonBlock className='h-6 w-20 rounded-full' />
                            <SkeletonBlock className='h-6 w-24 rounded-full' />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
