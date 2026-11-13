// Le fond d'un portrait sans image : un dégradé gris neutre, pris dans une
// courte liste de gris très peu saturés d'après le nom, pour que deux voisins
// ne soient pas identiques. La couleur (rôle, groupe) reste aux pastilles.

const GRAYS = ["#3a3a40", "#3b3936", "#36393c", "#3c383c", "#373a37", "#3d3d3d"];

export function neutralAvatarBackground(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return `linear-gradient(160deg, ${GRAYS[Math.abs(hash) % GRAYS.length]}, #1e1e21)`;
}
