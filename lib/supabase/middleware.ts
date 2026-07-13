import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
    const url = request.nextUrl;
    let supabaseResponse = NextResponse.next({
        request,
    });

    // If the env vars are not set, skip middleware check. You can remove this
    // once you setup the project.
    if (!hasEnvVars) {
        return supabaseResponse;
    }

    // With Fluid compute, don't put this client in a global environment
    // variable. Always create a new one on each request.
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Do not run code between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    // IMPORTANT: If you remove getClaims() and you use server-side rendering
    // with the Supabase client, your users may be randomly logged out.
    const { data } = await supabase.auth.getClaims();
    const user = data?.claims;

    if (
        request.nextUrl.pathname !== "/" &&
        !user &&
        !request.nextUrl.pathname.startsWith("/login") &&
        !request.nextUrl.pathname.startsWith("/auth")
    ) {
        // no user, potentially respond by redirecting the user to the login page
        const url = request.nextUrl.clone();
        url.pathname = "/auth/login";
        const redirectResponse = NextResponse.redirect(url);
        // Efface le cookie pour qu'un prochain utilisateur ne soit pas redirigé
        // vers un monde qui appartient à la session précédente.
        redirectResponse.cookies.set("last_world_id", "", { path: "/", maxAge: 0 });
        return redirectResponse;
    }

    // 1) Quand on visite un monde: /w/<id>
    // IMPORTANT : on pose le cookie sur `supabaseResponse` et on le retourne tel
    // quel. Créer un NextResponse.next() neuf jetterait les cookies de session
    // rafraîchis par getClaims() ci-dessus → la page serveur verrait une session
    // expirée (auth.uid() null) → RLS ne renvoie pas le monde → 404 sur des
    // mondes pourtant accessibles (cf. avertissement plus bas).
    if (url.pathname.startsWith("/w/") && url.pathname !== "/w") {
        const worldId = url.pathname.split("/")[2]; // /w/<id> => index 2

        if (worldId) {
            // Cookie valable 30 jours, à adapter
            supabaseResponse.cookies.set("last_world_id", worldId, {
                path: "/",
                maxAge: 60 * 60 * 24 * 30,
            });
            return supabaseResponse;
        }
    }

    // 2) Quand on visite l’index /w (bouton « mondes » de la sidebar) : on
    // délègue à la page d'accueil, seule responsable de choisir le monde de
    // destination. Elle vérifie que l'utilisateur est toujours MEMBRE du
    // dernier monde visité, puis retombe sur le premier monde accessible,
    // sinon /explore. Rediriger directement vers /w/<last_world_id> depuis
    // ici court-circuitait cette logique et menait à un 404 quand le monde
    // avait été quitté entre-temps (le cookie pointait encore dessus).
    if (url.pathname === "/w") {
        const redirectUrl = url.clone();
        redirectUrl.pathname = "/";
        const redirectResponse = NextResponse.redirect(redirectUrl);
        // Recopier les cookies de session pour ne pas casser l'auth.
        supabaseResponse.cookies.getAll().forEach((cookie) =>
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie),
        );
        return redirectResponse;
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is.
    // If you're creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return supabaseResponse;
}
