import type { Config } from 'tailwindcss';

/**
 * Design tokens ตาม spec.md §4.2 — กฎสองสีหมึก:
 *   navy   = ค่าที่คอนโซล "สั่ง" หุ่น
 *   carbon = ค่าที่หุ่น "รายงานกลับ"
 *   red    = หยุด / ยกเลิก / ปฏิเสธ เท่านั้น
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#12285A', 2: '#1D3A78', deep: '#0E2049' },
        carbon: { DEFAULT: '#5A4A7F', soft: '#7E6DA3', bg: '#F6F4FB' },
        ink: { DEFAULT: '#1B2432', 2: '#59657A', 3: '#5F6B7D' },
        line: { DEFAULT: '#E1E5EB', 2: '#CBD2DC', 3: '#AAB4C2' },
        surface: { DEFAULT: '#FFFFFF', 2: '#FAFBFC', 3: '#EEF1F5' },
        red: { DEFAULT: '#C0182C', bg: '#FDF2F3' },
        green: { DEFAULT: '#157347', bg: '#F1F8F4' },
        amber: { DEFAULT: '#8A5A00', bg: '#FDF6EA' },
        bg: '#F4F6F8',
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'var(--font-anuphan)', 'sans-serif'],
        mono: ['var(--font-courier)', 'ui-monospace', 'monospace'],
      },
      lineHeight: {
        body: '1.62',
        heading: '1.42',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    logs: false,
    themes: [
      {
        hermes: {
          primary: '#12285A',
          'primary-content': '#FFFFFF',
          secondary: '#5A4A7F',
          'secondary-content': '#FFFFFF',
          accent: '#C0182C',
          'accent-content': '#FFFFFF',
          neutral: '#1B2432',
          'neutral-content': '#FFFFFF',
          'base-100': '#FFFFFF',
          'base-200': '#FAFBFC',
          'base-300': '#EEF1F5',
          info: '#157347',
          'info-content': '#FFFFFF',
          success: '#157347',
          'success-content': '#FFFFFF',
          warning: '#8A5A00',
          'warning-content': '#FFFFFF',
          error: '#C0182C',
          'error-content': '#FFFFFF',
          radius: '0.09375rem',
          'radius-field': '0.09375rem',
        },
      },
    ],
  },
};

export default config;
