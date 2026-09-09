import type { Metadata } from 'next';
import { Archivo, Anuphan, Courier_Prime } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
  display: 'swap',
});

const anuphan = Anuphan({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-anuphan',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
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
