import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { createTranslator } from "next-intl";
import { worldCardContent, type SharePreview, type WorldCardContent } from "@/lib/sharePreview";

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

/** L'accroche de l'image générique. */
export function ogTitle(locale: Locale): string {
  return MESSAGES[locale].meta.description;
}

/** Textes de la carte d'un monde, dans la langue de l'image. */
export function ogWorldTexts(locale: Locale, preview: SharePreview): WorldCardContent {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "auth.share" });
  return worldCardContent(preview, {
    privateWorld: t("privateWorld"),
    members: (count) => t("members", { count }),
  });
}

const ACCENT = "#F94B5F";
const W_PATH =
  "M124.393 5.88568C140.08 -0.252386 157.773 7.48747 163.911 23.1738L213.682 150.369C219.82 166.055 212.08 183.747 196.394 189.886C180.708 196.024 163.015 188.283 156.877 172.597L134.823 116.238C133.904 120.918 132.846 125.493 131.663 129.913C127.632 144.969 121.984 158.941 114.981 169.646C109.294 178.34 101.597 186.539 91.7938 189.723C91.6608 189.777 91.5284 189.833 91.3944 189.886C75.708 196.024 58.0151 188.283 51.8768 172.597L2.1053 45.4023C-4.03282 29.7159 3.70716 12.024 19.3934 5.88568C35.0798 -0.252385 52.7727 7.48747 58.911 23.1738L104.968 140.878C106.975 135.796 108.811 130.203 110.412 124.224C114.984 107.146 117.358 88.0055 116.805 70.1933L107.105 45.4023C100.967 29.7159 108.707 12.024 124.393 5.88568Z";
const DOT_PATH =
  "M272.991 37.2774C272.877 42.685 271.734 48.6677 269.563 55.2258C267.277 61.7839 264.078 68.2269 259.964 74.5548C255.85 80.9979 250.937 87.0382 245.223 92.6758C240.553 97.2861 235.442 101.268 229.891 104.622C227.986 105.773 225.615 104.392 225.538 102.169C225.438 99.2919 225.315 96.4153 225.169 93.5387C224.94 89.7419 224.769 85.7151 224.654 81.4581C224.469 78.0008 224.283 74.847 224.098 71.9968C224.021 70.822 223.256 69.8131 222.175 69.3459C215.932 66.6469 210.931 62.458 207.171 56.779C203.057 50.5661 201 43.7204 201 36.2419C201 31.2946 201.972 26.6349 203.914 22.2629C205.743 17.8909 208.314 14.0366 211.628 10.7C214.827 7.47849 218.655 4.88978 223.112 2.93387C227.454 0.977956 232.082 0 236.996 0C241.909 0 246.594 0.977958 251.051 2.93387C255.393 4.88979 259.221 7.4785 262.535 10.7C265.735 14.0366 268.306 17.8909 270.248 22.2629C272.191 26.635 273.105 31.2946 272.991 36.2419V37.2774Z";

/** Le logo, le W et son point rouge. */
function Logo({ height }: { height: number }) {
  return (
    <svg width={Math.round((height * 273) / 192)} height={height} viewBox="0 0 273 192" fill="none">
      <path d={DOT_PATH} fill={ACCENT} />
      <path d={W_PATH} fill="#FAFAFA" />
    </svg>
  );
}

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

/** Dimensions de l'image, et de l'icône qu'on lui prépare (lib/ogImages). */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_ICON_SIZE = 128;

/** Couleurs de l'application (app/globals.css) : fond de page, pastille, texte secondaire. */
const FOND = "#18181B";
const PASTILLE = "#27272A";
const SECONDAIRE = "#9F9FA9";

/** Image générique : trait rouge, l'accroche ; WVLDS et le logo en pied. */
export function OgCard({ title }: { title: string }) {
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
      <Words text={title} size={title.length > 60 ? 58 : 72} style={{ fontWeight: 700, lineHeight: 1.12, maxWidth: 1000 }} />
      <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 2.4 }}>WVLDS</div>
        <Logo height={64} />
      </div>
    </div>
  );
}

const PLEIN = { position: "absolute", top: 0, left: 0, ...OG_SIZE } as const;

/** Bannière : voilée en haut, sous WVLDS et le logo. */
const VOILE_HAUT = "linear-gradient(to bottom, rgba(24,24,27,0.55) 0%, rgba(24,24,27,0) 28%)";
/** Sans bannière : une lueur grise en haut à droite, une rouge en bas à gauche. */
const LUEURS = [
  "radial-gradient(circle at 75% 35%, #3F3F46 0%, rgba(63,63,70,0) 55%)",
  "radial-gradient(circle at 25% 80%, rgba(249,75,95,0.2) 0%, rgba(249,75,95,0) 45%)",
];
/** Dans les deux cas : un dégradé sombre en bas, sous le texte. */
const VOILE_BAS = "linear-gradient(to top, rgba(24,24,27,0.95) 0%, rgba(24,24,27,0.7) 30%, rgba(24,24,27,0) 62%)";

/** Le cadenas de lucide, à la place de l'icône d'un monde privé ou 18+. */
function Cadenas() {
  return (
    <div
      data-og="cadenas"
      style={{
        width: OG_ICON_SIZE,
        height: OG_ICON_SIZE,
        borderRadius: 20,
        background: PASTILLE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 28,
        flexShrink: 0,
      }}
    >
      <svg width={60} height={60} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  );
}

export type OgWorldCardProps = WorldCardContent & {
  /** Bannière du monde, déjà à 1200×630, en `data:`. */
  banner?: string | null;
  /** Icône du monde, déjà carrée, en `data:` ; ignorée quand la carte est verrouillée. */
  icon?: string | null;
};

/**
 * Image d'un monde : la bannière en fond (sans elle, deux lueurs), WVLDS en
 * haut à gauche, le logo en haut à droite, et en bas à gauche, sur un dégradé
 * sombre, l'icône ou le cadenas, les membres ou « Monde privé · sur
 * invitation », le nom.
 */
export function OgWorldCard({ name, meta, locked, banner, icon }: OgWorldCardProps) {
  const image = locked ? null : icon;
  const avecVignette = locked || !!image;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: FOND,
        color: "#FAFAFA",
        fontFamily: "Geist",
      }}
    >
      {banner ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- image de next/og, pas une page */}
          <img src={banner} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={PLEIN} />
          <div style={{ ...PLEIN, backgroundImage: VOILE_HAUT }} />
        </>
      ) : (
        LUEURS.map((lueur) => <div key={lueur} style={{ ...PLEIN, backgroundImage: lueur }} />)
      )}
      <div style={{ ...PLEIN, backgroundImage: VOILE_BAS }} />
      {/* Le contenu dans son propre bloc : le moteur place les calques absolus
          à l'intérieur du rembourrage de leur parent. */}
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "44px 60px 64px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Words text="WVLDS" size={30} style={{ fontWeight: 700, letterSpacing: 2.4, marginTop: 8 }} />
          <Logo height={56} />
        </div>
        <div
          style={{ marginTop: "auto", display: "flex", alignItems: "center", maxWidth: 1080 }}
        >
          {locked ? (
            <Cadenas />
          ) : (
            image && (
              // eslint-disable-next-line @next/next/no-img-element -- image de next/og, pas une page
              <img
                src={image}
                alt=""
                width={OG_ICON_SIZE}
                height={OG_ICON_SIZE}
                style={{ borderRadius: 20, marginRight: 28, flexShrink: 0 }}
              />
            )
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Words
              text={meta.toUpperCase()}
              size={24}
              style={{ fontWeight: 700, letterSpacing: 2, color: SECONDAIRE, marginBottom: 10 }}
            />
            <Words
              text={name}
              size={name.length > 28 ? 50 : 62}
              style={{ fontWeight: 700, lineHeight: 1.05, maxWidth: avecVignette ? 860 : 1000 }}
            />
          </div>
        </div>
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
