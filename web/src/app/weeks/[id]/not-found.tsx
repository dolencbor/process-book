import styles from "@/components/week-page.module.css";

export default function WeekNotFound() {
  return <main className={styles.page}>
    <header className={styles.heading}><h1>Week not found</h1></header>
    <p>This week is unavailable or has not been published.</p>
  </main>;
}
