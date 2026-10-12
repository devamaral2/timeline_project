import type { MealRecipe } from "@/lib/api/contracts";
import { formatMinutes, pluralize } from "@/lib/events/event-detail-format";
import styles from "./meal-recipe.module.css";

/** Chave estavel sem usar o indice: o texto, mais a ocorrencia dele (ingredientes e passos podem repetir). */
function keyed<T>(items: readonly T[], textOf: (item: T) => string): Array<{ key: string; item: T }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const text = textOf(item);
    const occurrence = (seen.get(text) ?? 0) + 1;
    seen.set(text, occurrence);
    return { key: `${text}#${occurrence}`, item };
  });
}

/**
 * A receita da nota de refeição: os ingredientes e o modo de preparo. Quando
 * foi o modelo que a propôs ("Sugerida"), a tela diz isso — quem leu "o que eu
 * fiz" e quem leu "o que o app sugere" não devem confundir as duas.
 */
export function MealRecipeView({ recipe }: { recipe: MealRecipe }) {
  const meta = [
    recipe.servings ? pluralize(recipe.servings, "porção", "porções") : null,
    recipe.prepTimeMinutes ? `Preparo em ${formatMinutes(recipe.prepTimeMinutes)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <section className={styles.recipe} aria-label="Receita">
      <div className={styles.header}>
        <h3 className={styles.title}>Receita</h3>
        {recipe.source === "model" ? <span className={styles.badge}>Sugerida</span> : null}
      </div>
      {meta.length ? <p className={styles.meta}>{meta.join(" · ")}</p> : null}
      {recipe.ingredients.length ? (
        <div>
          <h4 className={styles.heading}>Ingredientes</h4>
          <ul className={styles.ingredients}>
            {keyed(recipe.ingredients, (ingredient) => ingredient.name).map(({ key, item: ingredient }) => (
              <li key={key}>
                <span>{ingredient.name}</span>
                <span className={styles.quantity}>{ingredient.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h4 className={styles.heading}>Modo de preparo</h4>
        <ol className={styles.steps}>
          {keyed(recipe.steps, (step) => step).map(({ key, item: step }) => (
            <li key={key}>{step}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
