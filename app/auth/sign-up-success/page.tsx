import { MailCheck } from "lucide-react";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <MailCheck className="h-8 w-8" />
          <h1 className="text-2xl font-bold">Vérifie ta boîte mail</h1>
          <p className="text-sm text-muted-foreground">
            Un lien de confirmation t&apos;a été envoyé. Clique dessus pour activer ton compte avant de te connecter.
          </p>
        </div>
      </div>
    </div>
  );
}
