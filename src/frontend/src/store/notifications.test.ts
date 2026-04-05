import { describe, expect, it, beforeEach } from 'vitest';
import { useNotificationStore } from './notifications';

describe('notification store', () => {
    beforeEach(() => {
        const store = useNotificationStore.getState();
        store.notifications.forEach((n) => store.dismiss(n.id));
    });

    it('notification store adds and removes', () => {
        const store = useNotificationStore.getState();
        store.push({ level: 'info', title: 'Test notification' });
        expect(useNotificationStore.getState().notifications).toHaveLength(1);
        const id = useNotificationStore.getState().notifications[0].id;
        store.dismiss(id);
        expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('notification store deduplicates', () => {
        const store = useNotificationStore.getState();
        store.push({ level: 'info', title: 'Duplicate' });
        store.push({ level: 'info', title: 'Duplicate' });
        expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it('different notifications are not deduplicated', () => {
        const store = useNotificationStore.getState();
        store.push({ level: 'info', title: 'First' });
        store.push({ level: 'warning', title: 'Second' });
        expect(useNotificationStore.getState().notifications).toHaveLength(2);
    });
});
