import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
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
        plugins: { jsdoc },
        rules: {
            // TypeScript's compiler already handles these; disable to avoid false positives
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                    publicOnly: true,
                },
            ],
            'jsdoc/require-param': 'warn',
            'jsdoc/require-returns': 'warn',
        },
    },
];
