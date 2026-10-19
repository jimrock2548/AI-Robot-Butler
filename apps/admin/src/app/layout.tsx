import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const archivo = localFont({
  src: '../../../../assets/fonts/archivo.ttf',
  weight: '400 700',
  variable: '--font-archivo',
  display: 'swap',
});

const anuphan = localFont({
  src: '../../../../assets/fonts/anuphan.ttf',
  weight: '400 700',
  variable: '--font-anuphan',
  display: 'swap',
});

const courierPrime = localFont({
  src: [
    { path: '../../../../assets/fonts/courier-regular.ttf', weight: '400' },
    { path: '../../../../assets/fonts/courier-bold.ttf', weight: '700' },
  ],
  variable: '--font-courier',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hermes Reception Control — คอนโซลผู้ดูแล',
  description:
    'ระบบควบคุมหุ่นยนต์ต้อนรับบนแชสซี SLAMTEC Hermes Pro Max (เอกสาร spec.md)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${archivo.variable} ${anuphan.variable} ${courierPrime.variable} theme hermes`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
