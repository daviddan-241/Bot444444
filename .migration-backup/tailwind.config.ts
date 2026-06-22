import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07111F',
        muted: '#65758B',
        line: '#E7ECF3',
        cloud: '#F6F8FB',
        blue: {
          50: '#EEF6FF',
          500: '#0A84FF',
          600: '#006BE6',
          700: '#0757B8'
        },
        emerald: {
          50: '#ECFDF5',
          500: '#10B981',
          600: '#059669'
        },
        amber: {
          50: '#FFFBEB',
          500: '#F59E0B'
        }
      },
      boxShadow: {
        soft: '0 18px 50px rgba(7, 17, 31, 0.08)',
        glass: '0 10px 35px rgba(10, 132, 255, 0.14)'
      },
      borderRadius: {
        '4xl': '2rem'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      }
    }
  },
  plugins: []
};
export default config;
