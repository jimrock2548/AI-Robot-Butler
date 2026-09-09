import type { Config } from 'tailwindcss';

/**
 * Design tokens — ตรงกับ spec §4.2 (ใช้ชุดเดียวกับ console)
 * Kiosk ไม่ผูกกับพิกเซล: ทุกขนาดในหน้า /kiosk เขียนเป็น calc(N * var(--u))
 * (NFR-10: 800×1280 และ 1080×1920 แนวตั้ง)
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#12285A', 2: '#1B3874', 3: '#24448C' },
        carbon: { DEFAULT: '#5A4A7F', 2: '#6E5C94' },
        red: { DEFAULT: '#C0182C', 2: '#A01425', bg: '#FBEAEC' },
        green: { DEFAULT: '#157347', bg: '#E8F5EE' },
        amber: { DEFAULT: '#8A5A00', bg: '#FFF4E0' },
        surface: { DEFAULT: '#FFFFFF', 2: '#FAFBFC', 3: '#EEF1F5' },
        line: { DEFAULT: '#E1E5EB', 2: '#CBD2DC', 3: '#AAB4C2' },
        ink: { DEFAULT: '#1B2432', 2: '#59657A', 3: '#5F6B7D' },
      },
      fontFamily: {
        sans: ['var(--font-anuphan)', 'system-ui', 'sans-serif'],
        display: ['var(--font-archivo)', 'var(--font-anuphan)', 'sans-serif'],
        mono: ['var(--font-courier)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '3px',
      },
    },
  },
  plugins: [],
};

export default config;
