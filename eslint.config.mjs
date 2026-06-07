import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.{ts,tsx,js,jsx}'],
        languageOptions: {
            parser: tsParser,
            globals: {
                ...globals.browser,
                ...globals.es2020,
            },
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
        },
    },
];
