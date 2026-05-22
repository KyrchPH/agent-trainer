/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chat: {
          bg: '#212121',
          panel: '#2f2f2f',
          input: '#2f2f2f',
          border: '#3f3f3f',
          text: '#ececec',
          muted: '#9b9b9b'
        }
      }
    }
  },
  plugins: []
};
