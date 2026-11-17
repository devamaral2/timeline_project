"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import type { FoodData } from "@repo/contracts";
import { MealGenerationStatus } from "@/components/notes/MealGenerationStatus";
import { MealRecipeView } from "@/components/notes/MealRecipeView";
import { macroShares } from "@/components/notes/NoteBody";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import { formatDecimal } from "@/lib/tasks/task-detail-format";
import styles from "./task-artifacts.module.css";

/**
 * O alimento (ou a refeição) dentro do cartão do artefato, no detalhe da tarefa: em cima, as calorias à
 * esquerda e os macros em lista à direita, com a barra de proporção embaixo; depois os alimentos, que
 * recolhem pela linha "Alimentos"; a receita, quando há; e, no rodapé do cartão, o aviso de que os números
 * são estimativa da IA. O detalhe do artefato continua com o `MealNote`, que tem a página inteira.
 */
export function TaskMealContent({ data }: { data: FoodData }) {
  const [foodsOpen, setFoodsOpen] = useState(true);
  const foodsId = useId();
  const status = data.generation?.status;

  if (status === "pending" || status === "failed") {
    return (
      <div className={styles.pad}>
        {data.description ? <p className={styles.description}>{data.description}</p> : null}
        <MealGenerationStatus data={data} />
      </div>
    );
  }

  const { totals } = data;
  const shares = macroShares(totals);
  const hasShares = shares[0] + shares[1] + shares[2] > 0;
  const macros = [
    { key: "protein", name: "Proteínas", grams: totals.totalProteinGrams, share: shares[0] },
    { key: "carbs", name: "Carboidratos", grams: totals.totalCarbohydrateGrams, share: shares[1] },
    { key: "fat", name: "Gorduras", grams: totals.totalFatGrams, share: shares[2] },
  ] as const;
  const kcal = formatDecimal(totals.totalCaloriesKcal);

  return (
    <>
      <section className={styles.summary} aria-label="Informações nutricionais">
        {data.description && data.items.length === 0 ? <p className={styles.description}>{data.description}</p> : null}
        <div className={styles.summaryTop}>
          <div className={styles.kcal}>
            <span className={styles.kcalValue} role="img" aria-label={`${kcal} quilocalorias consumidas`}>{kcal}<small>kcal</small></span>
            <span className={styles.kcalCaption}>consumidas</span>
          </div>
          <ul className={styles.macroList}>
            {macros.map((macro) => (
              <li key={macro.key} data-macro={macro.key}>
                <i aria-hidden />
                <span>{macro.name}</span>
                <strong>{`${formatDecimal(macro.grams)} g`}</strong>
              </li>
            ))}
          </ul>
        </div>
        {hasShares ? (
          <div
            className={styles.macroBar}
            role="img"
            aria-label={`De onde vêm as calorias: ${macros.map((macro) => `${macro.name.toLowerCase()} ${macro.share}%`).join(", ")}`}
          >
            {macros.map((macro) => <i key={macro.key} data-macro={macro.key} style={{ flex: macro.share }} />)}
          </div>
        ) : null}
      </section>
      {data.items.length ? (
        <>
          <button
            type="button"
            className={styles.foodsToggle}
            aria-expanded={foodsOpen}
            aria-controls={foodsId}
            onClick={() => setFoodsOpen((value) => !value)}
          >
            <span className={styles.foodsTitle}>Alimentos</span>
            <span className={styles.foodsCount}>{data.items.length}</span>
            <span className={styles.foodsChevron}><ChevronDown size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden /></span>
          </button>
          <ul className={styles.foods} id={foodsId} hidden={!foodsOpen}>
            {data.items.map((food) => (
              <li key={food.id}>
                <span className={styles.foodName}>
                  <span>{food.name}</span>
                  <span className={styles.foodPortion}>{food.portion || `${formatDecimal(food.approximateWeightGrams)} g`}</span>
                </span>
                <span className={styles.foodKcal}>{`${formatDecimal(food.caloriesKcal)} kcal`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.recipe ? <div className={styles.band}><MealRecipeView recipe={data.recipe} /></div> : null}
      {data.nutritionSource === "model-estimate" ? (
        <p className={styles.footnote}><Sparkles size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />Estimativa nutricional da IA</p>
      ) : null}
    </>
  );
}
