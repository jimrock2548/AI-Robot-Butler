import type { Metadata, Viewport } from 'next';
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

const courier = localFont({
  src: [
    { path: '../../../../assets/fonts/courier-regular.ttf', weight: '400' },
    { path: '../../../../assets/fonts/courier-bold.ttf', weight: '700' },
  ],
  variable: '--font-courier',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hermes — Robot Kiosk',
  description: 'จอหุ่น Hermes — เลือกห้องให้หุ่นพาไป',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#12285A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${archivo.variable} ${anuphan.variable} ${courier.variable}`}>
      <body>{children}</body>
    </html>
  );
}
