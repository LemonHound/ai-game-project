import type { NotificationLevel } from '../store/notifications';

interface Props {
    level: NotificationLevel;
    title: string;
    description?: string;
    onDismiss?: () => void;
}

const alertClass: Record<NotificationLevel, string> = {
    info: 'alert-info',
    warning: 'alert-warning',
    error: 'alert-error',
};

export default function NotificationDisplay({ level, title, description, onDismiss }: Props) {
    return (
        <div className={`alert ${alertClass[level]} shadow-lg`}>
            <div className='flex-1'>
                <p className='font-semibold'>{title}</p>
                {description && <p className='text-sm'>{description}</p>}
            </div>
            {onDismiss && (
                <button className='btn btn-sm btn-ghost btn-circle' onClick={onDismiss}>
                    ✕
                </button>
            )}
        </div>
    );
}
