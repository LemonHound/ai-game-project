import { create } from 'zustand';

export type NotificationLevel = 'info' | 'warning' | 'error';

export interface Notification {
    id: string;
    level: NotificationLevel;
    title: string;
    description?: string;
    timer?: number;
    timestamp: number;
}

interface NotificationStore {
    notifications: Notification[];
    push: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
    dismiss: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
    notifications: [],
    push: (n) => {
        const { notifications } = get();
        const isDuplicate = notifications.some(
            (existing) =>
                existing.level === n.level &&
                existing.title === n.title &&
                existing.description === n.description
        );
        if (isDuplicate) return;
        set({
            notifications: [
                ...notifications,
                { ...n, id: crypto.randomUUID(), timestamp: Date.now() },
            ],
        });
    },
    dismiss: (id) => {
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
    },
}));
