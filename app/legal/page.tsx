import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales et confidentialité — WVLDS",
  description:
    "Mentions légales, politique de confidentialité et conditions d'utilisation de WVLDS.",
};

const EMAIL = "caedrikbl@gmail.com";
const LAST_UPDATED = "12 juin 2026";
const linkClass = "underline hover:text-foreground transition-colors";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>
  );
}

function MailLink() {
  return (
    <a href={`mailto:${EMAIL}`} className={linkClass}>
      {EMAIL}
    </a>
  );
}

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span aria-hidden="true">←</span> Retour
        </Link>

        <h1 className="mb-2 text-3xl font-bold">
          Mentions légales et confidentialité
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Dernière mise à jour : {LAST_UPDATED}
        </p>

        <Section title="Éditeur du site">
          <P>
            WVLDS est un projet personnel.
            <br />
            Responsable de la publication : Cædrik
            <br />
            Contact : <MailLink />
          </P>
        </Section>

        <Section title="Responsable de la protection des renseignements personnels">
          <P>
            Conformément à la Loi 25 (Loi modernisant des dispositions
            législatives en matière de protection des renseignements
            personnels), la personne responsable de la protection des
            renseignements personnels est Cædrik, joignable à l'adresse{" "}
            <MailLink />. Toute question relative au traitement de vos données ou
            à l'exercice de vos droits peut lui être adressée.
          </P>
        </Section>

        <Section title="Hébergement">
          <P>
            Ce site est hébergé par Vercel Inc., 440 N Barranca Ave #4133,
            Covina, CA 91723, États-Unis.
          </P>
          <P>
            Certains services tiers utilisés pour le fonctionnement de
            l'application (hébergement, base de données) peuvent traiter ou
            stocker des données à l'extérieur du Québec, notamment aux
            États-Unis. Ces services sont sélectionnés pour offrir des garanties
            raisonnables de protection des renseignements personnels.
          </P>
        </Section>

        <Section title="Renseignements personnels collectés">
          <P>
            WVLDS collecte uniquement les renseignements nécessaires au
            fonctionnement du service : adresse de courriel, nom d'utilisateur,
            ainsi que les contenus que vous publiez. Ces renseignements servent
            exclusivement à l'authentification, au maintien de votre session et
            au fonctionnement de l'application. Ils ne sont ni vendus, ni loués,
            ni transmis à des tiers à des fins commerciales.
          </P>
        </Section>

        <Section title="Conservation des données">
          <P>
            Vos renseignements personnels sont conservés tant que votre compte
            demeure actif. Lorsque vous supprimez votre compte, ou sur demande de
            votre part, vos renseignements personnels sont détruits ou
            anonymisés dans un délai raisonnable, sauf obligation légale
            contraire de conservation.
          </P>
        </Section>

        <Section title="Vos droits">
          <P>
            Conformément à la Loi 25 et, pour les personnes situées dans l'Union
            européenne, au Règlement général sur la protection des données
            (RGPD), vous disposez d'un droit d'accès, de rectification et de
            suppression de vos données, ainsi que d'un droit de retrait de votre
            consentement et de portabilité. Pour exercer ces droits, écrivez à{" "}
            <MailLink />.
          </P>
          <P>
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez
            déposer une plainte auprès de la Commission d'accès à l'information
            du Québec (CAI) ou, pour les personnes situées dans l'Union
            européenne, auprès de l'autorité de contrôle compétente (par exemple
            la CNIL en France).
          </P>
        </Section>

        <Section title="Témoins (cookies)">
          <P>
            Ce site utilise uniquement des témoins strictement nécessaires à
            l'authentification et au maintien de la session. Aucun témoin
            publicitaire, de suivi ou d'analyse tiers n'est déposé, et aucun
            consentement supplémentaire n'est donc requis pour ces témoins
            essentiels.
          </P>
        </Section>

        <Section title="Incidents de confidentialité">
          <P>
            En cas d'incident de confidentialité présentant un risque de
            préjudice sérieux, des mesures raisonnables sont prises pour en
            limiter les conséquences, et les personnes concernées ainsi que la
            Commission d'accès à l'information sont avisées conformément à la
            Loi 25.
          </P>
        </Section>

        <Section title="Propriété intellectuelle — contenu utilisateurs">
          <P>
            Chaque utilisateur reste l'unique propriétaire des textes, messages
            et autres contenus qu'il publie sur WVLDS. En les soumettant, il
            accorde à WVLDS une licence non exclusive, gratuite et mondiale
            permettant leur affichage et leur diffusion au sein de
            l'application, dans le seul but de faire fonctionner le service.
            Cette licence prend fin dès la suppression du contenu par son auteur
            ou la clôture de son compte.
          </P>
          <P>
            WVLDS ne revendique aucun droit de propriété sur ces contenus et ne
            saurait être tenu responsable de leur légalité ou de leur exactitude.
            Tout contenu portant atteinte aux droits de tiers peut être signalé à
            l'adresse indiquée ci-dessus et sera supprimé dans les meilleurs
            délais.
          </P>
        </Section>

        <Section title="Images et médias tiers">
          <P>
            Les images, illustrations ou médias référencés ou hébergés sur WVLDS
            (avatars, illustrations de personnages, visuels partagés par les
            utilisateurs, etc.) ne sont pas la propriété de l'application. Ils
            restent soumis aux droits de leurs auteurs ou ayants droit
            respectifs. WVLDS ne garantit pas que leur utilisation est libre de
            droits et décline toute responsabilité en cas d'utilisation non
            autorisée d'une œuvre protégée par un tiers.
          </P>
          <P>
            Si vous êtes titulaire de droits sur un contenu publié sans votre
            autorisation, veuillez nous contacter afin que nous puissions
            procéder à son retrait.
          </P>
        </Section>

        <Section title="Code et interface">
          <P>
            Le code source, l'interface graphique et les éléments propres à
            WVLDS (design, structure, fonctionnalités) sont la propriété de leur
            éditeur. Toute reproduction ou réutilisation sans autorisation
            préalable est interdite.
          </P>
        </Section>

        <Section title="Responsabilité">
          <P>
            L'éditeur s'efforce de maintenir le site accessible et à jour mais ne
            saurait être tenu responsable des interruptions de service, erreurs
            ou dommages résultant de l'utilisation du site, ni du contenu publié
            par les utilisateurs.
          </P>
        </Section>

        <Section title="Droit applicable">
          <P>
            Les présentes mentions sont régies par les lois applicables au Québec
            et au Canada. Tout litige relatif à l'utilisation du site relève des
            tribunaux compétents du Québec.
          </P>
        </Section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Modifications</h2>
          <P>
            Ces mentions peuvent être mises à jour à tout moment afin de refléter
            l'évolution du service ou des obligations légales. La date de
            dernière mise à jour est indiquée en haut de cette page.
          </P>
        </section>
      </div>
    </main>
  );
}