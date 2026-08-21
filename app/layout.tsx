import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OK Restaurant — Taste That Brings You Back',
  description: 'Multi-branch food ordering platform for OK Restaurant (Dera Chungi, Sherifalon Bypass, Kot Chuta). Order burgers, pizzas, karahi, deals & more!',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
