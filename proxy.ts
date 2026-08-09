import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Le SW est enregistré avec fetch credentials same-origin : une
        // redirection (login) fait échouer navigator.serviceWorker.register
        // avec une SecurityError. Le manifest doit aussi rester joignable
        // sans session pour l'invite d'installation d'un visiteur non connecté.
        "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
