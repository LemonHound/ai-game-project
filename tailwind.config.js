/** @type {import('tailwindcss').Config} */

module.exports = {
    content: [
        "./src/frontend/public/**/*.{html,js}",
        "./src/frontend/public/js/**/*.js"
    ],
    theme: {
        extend: {
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float-gentle': 'floatGentle 4s ease-in-out infinite',
                'gradient-shift': 'gradientShift 15s ease infinite',
                'shimmer': 'shimmer 2s infinite',
                'fade-in': 'fadeIn 0.6s ease forwards',
            },
            keyframes: {
                floatGentle: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-5px)' },
                },
                gradientShift: {
                    '0%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                    '100%': { backgroundPosition: '0% 50%' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                fadeIn: {
                    'to': { opacity: '1' },
                }
            },
            transitionProperty: {
                'height': 'height',
                'spacing': 'margin, padding',
            },
            backgroundSize: {
                '400': '400% 400%',
            }
        },
    },
    plugins: [
        require('daisyui'),
    ],
    daisyui: {
        themes: [
            "light",
            "synthware",
            "retro",
            "garden",
            "halloween",
            "forest",
            "aqua",
            "fantasy",
            "luxury",
            "dracula",
            "autumn",
            "business",
            "acid",
            "night",
            "coffee",
            "dim",
            "nord",
            "sunset",
            "caramellatte",
            "abyss",
            "silk"
        ],
        darkTheme: "luxury",
        lightTheme: "garden",
        base: true,
        styled: true,
        utils: true,
        logs: true,
    }
}