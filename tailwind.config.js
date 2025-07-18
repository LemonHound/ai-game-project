/** @type {import('tailwindcss').Config} */

module.exports = {
    content: [
        "./src/frontend/views/**/*.ejs",
        "./src/frontend/views/**/*.html",
        "./src/frontend/public/**/*.{html,js}",
        "./src/frontend/public/js/**/*.js"
    ],
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