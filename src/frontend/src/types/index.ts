export interface User {
    id: number;
    username: string;
    email: string;
    displayName: string;
    profilePicture?: string;
    authProvider: 'local' | 'google';
    emailVerified: boolean;
    lastLogin?: string;
}

export interface Game {
    id: string;
    name: string;
    description: string;
    icon: string;
    difficulty: string;
    players: string;
    status: string;
    category: string;
    tags: string[];
}

export interface ApiError {
    detail: string;
}
