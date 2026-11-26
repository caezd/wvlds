import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { shareCardContent, type SharePreview } from "@/lib/sharePreview";

/**
 * Carte d'aperçu des liens (OpenGraph, 1200×630), rendue par `next/og`.
 *
 * Les robots d'aperçu n'envoient ni cookie ni, souvent, de langue : la langue
 * de l'image passe donc dans son adresse (`?lang=`), posée par la page qui la
 * référence. Les messages sont lus directement — pas de requête next-intl
 * dans une image.
 */

const MESSAGES = { fr, en, es } as const;

export function ogLocale(value: string | null | undefined): Locale {
  const base = (value ?? "").split("-")[0].toLowerCase() as Locale;
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

export type OgTexts = { surtitle: string | null; title: string; subtitle: string | null };

export function ogTexts(locale: Locale, preview: SharePreview | null): OgTexts {
  const m = MESSAGES[locale];
  if (!preview) return { surtitle: null, title: m.meta.description, subtitle: null };
  return shareCardContent(preview, m.auth.share);
}

const ACCENT = "#F94B5F";
const W_PATH =
  "M124.393 5.88568C140.08 -0.252386 157.773 7.48747 163.911 23.1738L213.682 150.369C219.82 166.055 212.08 183.747 196.394 189.886C180.708 196.024 163.015 188.283 156.877 172.597L134.823 116.238C133.904 120.918 132.846 125.493 131.663 129.913C127.632 144.969 121.984 158.941 114.981 169.646C109.294 178.34 101.597 186.539 91.7938 189.723C91.6608 189.777 91.5284 189.833 91.3944 189.886C75.708 196.024 58.0151 188.283 51.8768 172.597L2.1053 45.4023C-4.03282 29.7159 3.70716 12.024 19.3934 5.88568C35.0798 -0.252385 52.7727 7.48747 58.911 23.1738L104.968 140.878C106.975 135.796 108.811 130.203 110.412 124.224C114.984 107.146 117.358 88.0055 116.805 70.1933L107.105 45.4023C100.967 29.7159 108.707 12.024 124.393 5.88568Z";
const DOT_PATH =
  "M272.991 37.2774C272.877 42.685 271.734 48.6677 269.563 55.2258C267.277 61.7839 264.078 68.2269 259.964 74.5548C255.85 80.9979 250.937 87.0382 245.223 92.6758C240.553 97.2861 235.442 101.268 229.891 104.622C227.986 105.773 225.615 104.392 225.538 102.169C225.438 99.2919 225.315 96.4153 225.169 93.5387C224.94 89.7419 224.769 85.7151 224.654 81.4581C224.469 78.0008 224.283 74.847 224.098 71.9968C224.021 70.822 223.256 69.8131 222.175 69.3459C215.932 66.6469 210.931 62.458 207.171 56.779C203.057 50.5661 201 43.7204 201 36.2419C201 31.2946 201.972 26.6349 203.914 22.2629C205.743 17.8909 208.314 14.0366 211.628 10.7C214.827 7.47849 218.655 4.88978 223.112 2.93387C227.454 0.977956 232.082 0 236.996 0C241.909 0 246.594 0.977958 251.051 2.93387C255.393 4.88979 259.221 7.4785 262.535 10.7C265.735 14.0366 268.306 17.8909 270.248 22.2629C272.191 26.635 273.105 31.2946 272.991 36.2419V37.2774Z";

/**
 * Un texte lettre à lettre, les mots séparés par un espace fixe.
 *
 * Le moteur de `next/og` (Satori) mesure un mot sans le crénage de la police
 * mais le dessine avec : un mot riche en paires crénées (« Hextech »,
 * « description ») laisse derrière lui un trou — « Hextech␣␣Gunblade ».
 * Vérifié avec sa police par défaut comme avec Geist ; ni `fontKerning` ni
 * des mots séparés n'y changent rien. Lettre à lettre, mesure et dessin
 * coïncident : l'espacement est régulier, au prix du crénage.
 */
function Words({ text, size, style }: { text: string; size: number; style?: Record<string, string | number> }) {
  const mots = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", fontSize: size, ...style }}>
      {mots.map((mot, i) => (
        <div key={i} style={{ display: "flex", marginRight: i < mots.length - 1 ? Math.round(size * 0.26) : 0 }}>
          {Array.from(mot).map((lettre, j) => (
            <span key={j}>{lettre}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Le contenu de l'image : trait rouge, titre, sous-titre ; WVLDS et le logo en pied. */
export function OgCard({ surtitle, title, subtitle }: OgTexts) {
  const long = title.length > 60;
  const sousTitre = subtitle && subtitle.length > 140 ? `${subtitle.slice(0, 137).trimEnd()}…` : subtitle;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "88px 96px 72px",
        background: "#1B1B1D",
        color: "#FAFAFA",
        fontFamily: "Geist",
      }}
    >
      <div style={{ width: 96, height: 8, borderRadius: 4, background: ACCENT, marginBottom: 40 }} />
      {surtitle && (
        <Words
          text={surtitle.toUpperCase()}
          size={26}
          style={{ fontWeight: 700, letterSpacing: 2, color: "#A1A1AA", marginBottom: 16 }}
        />
      )}
      <Words text={title} size={long ? 58 : 72} style={{ fontWeight: 700, lineHeight: 1.12, maxWidth: 1000 }} />
      {sousTitre && (
        <Words text={sousTitre} size={34} style={{ fontWeight: 400, marginTop: 24, lineHeight: 1.35, color: "#B4B4BB", maxWidth: 960 }} />
      )}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2.4 }}>WVLDS</div>
        <svg width={91} height={64} viewBox="0 0 273 192" fill="none">
          <path d={DOT_PATH} fill={ACCENT} />
          <path d={W_PATH} fill="#FAFAFA" />
        </svg>
      </div>
    </div>
  );
}

export type OgFont = { name: "Geist"; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

let geist: Promise<OgFont[]> | null = null;

/**
 * Geist, régulier et gras. `next/og` n'embarque que le régulier, et ne lit pas
 * les polices variables (woff2) de l'application : on prend les versions
 * statiques de Google Fonts, une fois par processus. En cas d'échec, l'image
 * se rend quand même avec la police par défaut — et on réessaiera.
 */
export function loadGeist(): Promise<OgFont[]> {
  geist ??= (async () => {
    try {
      const css = await fetch("https://fonts.googleapis.com/css2?family=Geist:wght@400;700").then((r) => r.text());
      const faces = [...css.matchAll(/font-weight:\s*(400|700);[^}]*?src:\s*url\(([^)]+)\)\s*format\(['"](?:opentype|truetype)['"]\)/g)];
      const fonts = await Promise.all(
        faces.map(async ([, weight, url]) => {
          const res = await fetch(url);
          return res.ok ? ({ name: "Geist", data: await res.arrayBuffer(), weight: Number(weight), style: "normal" } as OgFont) : null;
        }),
      );
      return fonts.filter((f): f is OgFont => f !== null);
    } catch {
      return [];
    }
  })().then((fonts) => {
    if (fonts.length < 2) geist = null;
    return fonts;
  });
  return geist;
}
