import Navbar from '@/components/common/Navbar';
import Footer from '@/components/common/Footer';
import styles from '../home.module.css'; // Reuse home styles for simplicity

export default function HowToPage() {
    return (
        <div className={styles.container}>
            <Navbar />
            <main className={styles.main}>
                <section className={styles.hero}>
                    <div className={styles.heroContent}>
                        <h1 className={styles.title}>How to use Tooltrace</h1>
                        <p className={styles.subtitle}>Follow these simple steps to create your custom inserts.</p>
                    </div>
                </section>

                <section className={styles.features}>
                    <div className={styles.featuresContent} style={{ textAlign: 'left', maxWidth: '800px' }}>
                        <h3 className={styles.cardTitle}>1. Take a Photo</h3>
                        <p className="mb-8">Place your tools on a standard sheet of paper (Letter or A4). Make sure the paper corners are visible. Take a photo from directly above to minimize perspective distortion.</p>

                        <h3 className={styles.cardTitle}>2. Upload to Tooltrace</h3>
                        <p className="mb-8">Go to the Designer and upload your photo. Click on the paper corners if asked, to calibrate the scale.</p>

                        <h3 className={styles.cardTitle}>3. Trace Tools</h3>
                        <p className="mb-8">Click "Add Tool" and click on each tool. Our system will contour them automatically.</p>

                        <h3 className={styles.cardTitle}>4. Export</h3>
                        <p>Choose "Gridfinity" for 3D printing or "Foam" for laser cutting. Download your file!</p>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
