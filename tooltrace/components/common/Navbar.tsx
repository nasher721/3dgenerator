import Link from 'next/link';
import styles from './Navbar.module.css';
import { PenTool } from 'lucide-react';

export default function Navbar() {
    return (
        <nav className={styles.nav}>
            <Link href="/" className={styles.logo}>
                <PenTool size={24} />
                <span>TOOLTRACE</span>
                <span className={styles.logoBadge}>by finalREV</span>
            </Link>

            <div className={styles.links}>
                <Link href="/">Home</Link>
                <Link href="/how-to">How To</Link>
                <Link href="/about">About</Link>
            </div>

            <div className={styles.actions}>
                <Link href="/designer" className={styles.getStarted}>
                    Get Started &rarr;
                </Link>
            </div>
        </nav>
    );
}
