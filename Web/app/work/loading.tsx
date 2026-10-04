import styles from "../prototype/project-workflow/workflow.module.css";
export default function LoadingWork(){return <main className={styles.main} aria-busy="true"><section className={styles.statePanel} role="status"><h1>Retrieving project work…</h1><p>Waiting for current Core records. No prior candidate is being approved.</p><div className={styles.skeleton}/></section></main>;}
