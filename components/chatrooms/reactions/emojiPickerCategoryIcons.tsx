import {
  Clock,
  Flag,
  Hash,
  Leaf,
  Lightbulb,
  Plane,
  Smile,
  Star,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";
import type { CategoryIcons } from "emoji-picker-react";

/**
 * Icônes des onglets de catégories, en Lucide comme partout ailleurs.
 *
 * Sans cette table, la librairie dessine ses onglets depuis un sprite dont
 * l'état actif est un bleu peint dans l'image : aucune règle CSS ne peut le
 * ramener à l'accent de l'application. Des icônes React héritent au contraire
 * de `currentColor`, donc de la couleur que leur donne la feuille de style
 * (cf. `.wvlds-emoji-picker` dans app/globals.css).
 *
 * Les clés sont les valeurs de l'énumération `Categories` de la librairie ;
 * seul son type est importé, pour que ce module n'entraîne pas le bundle du
 * sélecteur hors des chunks paresseux.
 */
export const EMOJI_CATEGORY_ICONS = {
  suggested: <Clock />,
  custom: <Star />,
  smileys_people: <Smile />,
  animals_nature: <Leaf />,
  food_drink: <UtensilsCrossed />,
  travel_places: <Plane />,
  activities: <Trophy />,
  objects: <Lightbulb />,
  symbols: <Hash />,
  flags: <Flag />,
} satisfies CategoryIcons;
