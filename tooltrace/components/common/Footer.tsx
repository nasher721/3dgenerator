import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={styles.content}>
                <div className={styles.column}>
                    <h3>Tooltrace</h3>
                    <ul>
                        <li>Oakland, CA</li>
                        <li><Link href="/contact">Contact Us</Link></li>
                    </ul>
                </div>

                <div className={styles.column}>
                    <h3>Other Apps</h3>
                    <ul>
                        <li><a href="#">finalREV</a></li>
                        <li><a href="#">Rocket Brackets</a></li>
                        <li><a href="#">Gearmaker</a></li>
                    </ul>
                </div>

                <div className={styles.column}>
                    <h3>Company</h3>
                    <ul>
                        <li><Link href="/about">About</Link></li>
                        <li><Link href="/5s">5S / Lean</Link></li>
                        <li><Link href="/faq">FAQ</Link></li>
                    </ul>
                </div>
            </div>

            <div className={styles.bottom}>
                &copy; 2026 finalREV All rights reserved.
            </div>
        </footer>
    );
}
