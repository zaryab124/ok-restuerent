import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OK Restaurant — Ap OK Karien, Bas',
  description: 'Official multi-branch food ordering platform for OK Restaurant (Dera Chungi, Sherifalon Bypass, Kot Chuta). Ap OK Karien, Bas!',
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
      </body>
    </html>
  );
}
