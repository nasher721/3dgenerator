import Link from 'next/link';
import Navbar from '@/components/common/Navbar';
import Footer from '@/components/common/Footer';
import styles from './home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Navbar />

      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.title}>
              Toolbox Inserts Made in <span className={styles.highlight}>One Click</span>
            </h1>
            <p className={styles.subtitle}>
              Take a picture of your tools and instantly get custom shadowbox foam or gridfinity inserts.
            </p>
            <div>
              <Link
                href="/designer"
                className={styles.ctaButton}
              >
                Get Started
              </Link>
            </div>
          </div>
        </section>

        {/* Features/Info Placeholder */}
        <section className={styles.features}>
          <div className={styles.featuresContent}>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <div className={styles.stepIcon}>1</div>
                <h3 className={styles.cardTitle}>Snap a Photo</h3>
                <p className={styles.cardText}>Place tools on standard paper and take a top-down photo.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.stepIcon}>2</div>
                <h3 className={styles.cardTitle}>Auto-Generate</h3>
                <p className={styles.cardText}>AI traces your tools and creates perfect layouts.</p>
              </div>
              <div className={styles.card}>
                <div className={styles.stepIcon}>3</div>
                <h3 className={styles.cardTitle}>Order or Cut</h3>
                <p className={styles.cardText}>Export STLs for Gridfinity or DXFs for foam.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
