/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/frontend/src/**/*.{ts,tsx}', './src/frontend/index.html'],
    theme: {
        extend: {},
    },
    plugins: [require('daisyui')],
    daisyui: {
        themes: ['light', 'dark', 'cupcake', 'cyberpunk', 'synthwave'],
        darkTheme: 'dark',
        base: true,
        styled: true,
        utils: true,
    },
    safelist: [
        {
            pattern: /./,
        },
    ],
};
