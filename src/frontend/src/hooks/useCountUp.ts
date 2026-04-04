import { useEffect, useRef, useState } from 'react';

/** Animates a number from 0 to the target value over the given duration using requestAnimationFrame. */
export function useCountUp(target: number, duration: number = 1000): number {
    const [value, setValue] = useState(0);
    const rafRef = useRef<number>(0);
    const startRef = useRef<number>(0);

    useEffect(() => {
        if (target === 0) {
            setValue(0);
            return;
        }

        startRef.current = performance.now();

        const step = (now: number) => {
            const elapsed = now - startRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = target * eased;
            setValue(Number.isInteger(target) ? Math.round(current) : parseFloat(current.toFixed(3)));

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(step);
            }
        };

        rafRef.current = requestAnimationFrame(step);

        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration]);

    return value;
}
