import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Logo from "@/components/logo";

/** Étoiles en pur CSS : une poignée de points blancs en radial-gradient */
const STARRY_SKY: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.9), transparent 50%),
    radial-gradient(1.5px 1.5px at 28% 42%, rgba(255,255,255,0.7), transparent 50%),
    radial-gradient(1px 1px at 41% 12%, rgba(255,255,255,0.8), transparent 50%),
    radial-gradient(2px 2px at 57% 33%, rgba(180,200,255,0.8), transparent 50%),
    radial-gradient(1px 1px at 66% 58%, rgba(255,255,255,0.6), transparent 50%),
    radial-gradient(1.5px 1.5px at 78% 21%, rgba(255,255,255,0.85), transparent 50%),
    radial-gradient(1px 1px at 87% 47%, rgba(200,215,255,0.7), transparent 50%),
    radial-gradient(1px 1px at 22% 71%, rgba(255,255,255,0.5), transparent 50%),
    radial-gradient(1.5px 1.5px at 49% 82%, rgba(255,255,255,0.6), transparent 50%),
    radial-gradient(1px 1px at 73% 88%, rgba(255,255,255,0.45), transparent 50%),
    radial-gradient(2px 2px at 92% 74%, rgba(170,190,255,0.6), transparent 50%),
    radial-gradient(1px 1px at 8% 55%, rgba(255,255,255,0.55), transparent 50%),
    linear-gradient(195deg, #0b0d1a 0%, #141a30 55%, #1c2742 100%)
  `,
};

export default function NotFound() {
  return (
    <div className="flex h-full w-full gap-3 p-3">
      {/* -- Colonne principale ------------------------------------ */}
      <div className="relative flex min-h-full flex-1 flex-col items-center rounded-2xl bg-background">
        <div className="pt-10">
          <Logo width={26} height={26} accent="var(--color-accent)" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-semibold text-accent">Erreur 404</p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
            Page introuvable
          </h1>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Désolé, la page que tu cherches n&apos;existe pas ou n&apos;est
            plus accessible.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </div>

        <footer className="flex items-center gap-6 pb-8 text-xs text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            Accueil
          </Link>
          <Link href="/p" className="transition-colors hover:text-foreground">
            Personae
          </Link>
          <Link
            href="/shop"
            className="transition-colors hover:text-foreground"
          >
            Boutique
          </Link>
        </footer>
      </div>

      {/* -- Panneau visuel (ciel étoilé) --------------------------- */}
      <aside
        className="relative hidden w-[42%] flex-col justify-end overflow-hidden rounded-2xl p-6 lg:flex"
        style={STARRY_SKY}
      >
        <p className="max-w-md text-sm leading-relaxed text-white/90">
          Chaque monde commence par une page blanche. Celui que tu cherchais semble s'être évaporé, mais rien ne t'empêche d'en créer un nouveau.
        </p>
      </aside>
    </div>
  );
}
