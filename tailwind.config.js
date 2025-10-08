/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/frontend/templates/**/*.html', './src/frontend/public/**/*.js'],
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
