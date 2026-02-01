import Navbar from '@/components/common/Navbar';
import Footer from '@/components/common/Footer';
import styles from '../home.module.css';

export default function AboutPage() {
    return (
        <div className={styles.container}>
            <Navbar />
            <main className={styles.main}>
                <section className={styles.hero}>
                    <div className={styles.heroContent}>
                        <h1 className={styles.title}>About Tooltrace</h1>
                        <p className={styles.subtitle}>Free tool shadow tracing for Gridfinity bins and shadowbox foam.</p>
                    </div>
                </section>

                <section className={styles.features}>
                    <div className={styles.featuresContent} style={{ textAlign: 'left', maxWidth: '800px' }}>
                        <p className="mb-6 text-lg">
                            Tooltrace was built to help makers, hobbyists, and professionals organize their workshops without spending hours in CAD.
                        </p>
                        <p className="mb-6">
                            By using computer vision, we can transform a simple photograph into accurate, cut-ready files for 3D printing or CNC machining.
                        </p>
                        <h3 className="text-xl font-bold mt-8 mb-4">Credits</h3>
                        <p>
                            Built by the finalREV team.
                            <br />Based in Oakland, CA.
                        </p>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
