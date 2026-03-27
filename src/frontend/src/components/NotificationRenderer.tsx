import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/notifications';
import NotificationDisplay from './NotificationDisplay';

const MAX_VISIBLE = 3;

export default function NotificationRenderer() {
    const { notifications, dismiss } = useNotificationStore();
    const visible = notifications.slice(0, MAX_VISIBLE);
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        visible.forEach((n) => {
            if (n.timer !== undefined && !timersRef.current.has(n.id)) {
                const t = setTimeout(() => dismiss(n.id), n.timer);
                timersRef.current.set(n.id, t);
            }
        });

        timersRef.current.forEach((t, id) => {
            if (!notifications.find((n) => n.id === id)) {
                clearTimeout(t);
                timersRef.current.delete(id);
            }
        });
    }, [notifications, dismiss]);

    useEffect(() => {
        return () => {
            timersRef.current.forEach((t) => clearTimeout(t));
        };
    }, []);

    if (visible.length === 0) return null;

    return (
        <div className='fixed top-4 right-4 z-50 flex w-80 flex-col gap-2'>
            {visible.map((n) => (
                <NotificationDisplay
                    key={n.id}
                    level={n.level}
                    title={n.title}
                    description={n.description}
                    onDismiss={() => dismiss(n.id)}
                />
            ))}
        </div>
    );
}
