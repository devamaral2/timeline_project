import { Apple, ArrowLeft, CalendarDays, Clock3, FileText, MapPin, MoreHorizontal, Pencil, Utensils } from "lucide-react";
import Link from "next/link";
import { BrandIcon } from "../mockup-shell";
import styles from "../mockup.module.css";

export default function LunchMockup() {
  return (
    <main id="conteudo" className={styles.detailMain}>
      <div className={styles.detailNavigation}>
        <Link href="/mockups/eventos" className={styles.backLink} aria-label="Voltar à agenda"><ArrowLeft aria-hidden /><span>Agenda</span></Link>
        <Link href="/mockups/eventos" className={styles.detailBrand} aria-label="Braid — agenda"><BrandIcon /><span className={styles.wordmark}>Braid</span></Link>
        <button type="button" disabled className={styles.iconButton} aria-label="Mais opções do evento"><MoreHorizontal aria-hidden /></button>
      </div>

      <header className={styles.detailHeading} data-type="meal">
        <span className={styles.detailType}><Apple aria-hidden />Refeição</span>
        <h1>Almoço</h1>
        <p>Uma pausa no meio do dia.</p>
        <div className={styles.detailMeta}>
          <span><CalendarDays aria-hidden />Hoje, 14 de setembro</span>
          <span><Clock3 aria-hidden />12:30 — 13:00<span className={styles.detailDuration}>30 min</span></span>
        </div>
        <div className={styles.detailDurationTrack} aria-hidden><span /></div>
      </header>

      <section className={styles.detailInfo} aria-label="Informações do evento">
        <div><MapPin aria-hidden /><div><h2>Local</h2><p>Casa</p></div></div>
        <div><Utensils aria-hidden /><div><h2>Refeição</h2><p>Arroz integral, frango grelhado, feijão e salada.</p></div></div>
        <div><FileText aria-hidden /><div><h2>Observações</h2><p>Comer com calma e aproveitar a pausa.</p></div></div>
      </section>

      <section className={styles.nutrition} aria-label="Resumo nutricional ilustrativo">
        <h2>Resumo nutricional</h2>
        <div className={styles.nutritionGrid}>
          {[
            { label: "Calorias", value: "530", unit: "kcal" },
            { label: "Proteína", value: "38", unit: "g" },
            { label: "Carboidratos", value: "54", unit: "g" },
            { label: "Gorduras", value: "18", unit: "g" },
          ].map(({ label, value, unit }) => (
            <div key={label}><p>{value}<span>{unit}</span></p><h3>{label}</h3></div>
          ))}
        </div>
      </section>

      <div className={styles.detailFooter}>
        <label className={styles.missedCheckbox}><input type="checkbox" disabled />Não realizado</label>
        <button type="button" disabled className={styles.editButton}><Pencil aria-hidden />Editar evento</button>
      </div>
      <p className={styles.detailPrototypeNote}>Estudo visual · dados de exemplo</p>
    </main>
  );
}
