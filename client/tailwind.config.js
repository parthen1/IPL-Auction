/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'auction-primary': '#0f172a', // Premium Black/Slate
                'auction-secondary': '#f59e0b', // Premium Gold
                'auction-bg': '#020617', // Very dark blue/black for backgrounds
                'auction-surface': '#1e293b', // Lighter slate for cards
            }
        },
    },
    plugins: [],
}
