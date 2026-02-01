import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tooltrace | AI Toolbox Inserts',
  description: 'Generate custom shadowbox foam or gridfinity inserts from photos.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
