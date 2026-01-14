import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import './globals.css';

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' });
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const productionUrl = 'https://iraneternal.com';

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: 'Iran Eternal | The Voice of Freedom',
  description: 'The Islamic regime in Iran has cut the internet since Jan 8 to hide a massacre. Men, women, and children are being killed in the dark right now. Don\'t let the world look away. Your voice is their lifeline.',
  
  // Open Graph (Facebook, WhatsApp, LinkedIn, iMessage)
  openGraph: {
    title: 'Iran Eternal | The Voice of Freedom',
    description: 'The Islamic regime has cut the internet to hide a massacre. Break the silence.',
    url: productionUrl,
    siteName: 'Iran Eternal',
    images: [
      {
        url: '/hero.jpg', 
        width: 1200,
        height: 630,
        alt: 'Iran Eternal - The Voice of Freedom',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // X Configuration
  twitter: {
    card: 'summary_large_image', 
    title: 'Iran Eternal | The Voice of Freedom',
    description: 'The Islamic regime has cut the internet to hide a massacre. Break the silence.',
    images: ['/hero.jpg'], 
  },
  
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${inter.variable} font-sans bg-[#111] text-white`}>
        {children}
      </body>
    </html>
  );
}