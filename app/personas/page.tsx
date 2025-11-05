import { createClient } from "@/lib/supabase/server";
import PersonaCreateDialog from "@/components/personas/PersonaCreateDialog";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default async function PersonasPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return <div>Veuillez vous connecter.</div>;

    const [{ data: personas }, { data: profile }] = await Promise.all([
        supabase
            .from("personas")
            .select("*")
            .order("created_at", { ascending: true }),
        supabase.from("profiles").select("is_subscribed").single(),
    ]);

    const count = personas?.length ?? 0;
    const isSubscribed = !!profile?.is_subscribed;
    const limit = isSubscribed ? Infinity : 5;
    const remaining = isSubscribed ? "∞" : Math.max(0, 5 - count);

    return (
        <main className="composer-parent flex flex-col focus-visible:outline-0 h-full">
            <header className="draggable no-draggable-children sticky top-0 p-2 touch:p-2.5 flex items-center justify-between z-20 h-header-height bg-token-main-surface-primary pointer-events-none select-none [view-transition-name:var(--vt-page-header)] *:pointer-events-auto motion-safe:transition max-md:hidden [box-shadow:var(--sharp-edge-top-shadow-placeholder)]">
                <div className="pointer-events-none absolute start-0 flex flex-col items-center gap-2 lg:start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2">
                    {/* open button */}
                </div>
                <div className="flex items-center">
                    <div className="flex items-center">
                        <a
                            href=""
                            className="hover:bg-token-bg-tertiary focus-visible:outline-token-outline-primary text-token-text-secondary ms-2 inline-flex h-9 w-9 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <Users size={20} />
                        </a>
                    </div>
                </div>
                {/* <h1 className="text-2xl font-semibold">Mes personas</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                        {isSubscribed
                            ? "Abonné · illimité"
                            : `Gratuit · ${count}/5`}
                    </span>
                    <PersonaCreateDialog
                        disabled={!isSubscribed && count >= 5}
                    />
                </div> */}
            </header>

            <div className="relative basis-auto flex-col -mb-(--composer-overlap-px) [--composer-overlap-px:28px] grow flex overflow-hidden">
                <div className="relative h-full">
                    <div className="flex h-full flex-col overflow-y-auto thread-xl:pt-(--header-height) [scrollbar-gutter:stable_both-edges]">
                        <div className="flex flex-col text-sm thread-xl:pt-header-height pb-25">
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                            <div>
                                test Lorem ipsum dolor sit amet consectetur
                                adipisicing elit. Facere impedit eum
                                exercitationem aliquam, alias quam sapiente
                                aliquid laboriosam, itaque harum obcaecati. Sint
                                deserunt quisquam quam reiciendis nihil illum
                                expedita quod.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <footer
                id="thread-bottom-container"
                className="group/thread-bottom-container relative isolate z-10 w-full basis-auto has-data-has-thread-error:pt-2 has-data-has-thread-error:[box-shadow:var(--sharp-edge-bottom-shadow)] md:border-transparent md:pt-0 dark:border-white/20 md:dark:border-transparent content-fade single-line"
            >
                <div className="text-base mx-auto [--thread-content-margin:--spacing(4)] thread-sm:[--thread-content-margin:--spacing(6)] thread-lg:[--thread-content-margin:--spacing(16)] px-(--thread-content-margin)">
                    <div className="[--thread-content-max-width:40rem] thread-lg:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1">
                        <div className="flex justify-center empty:hidden"></div>
                        <div className="pointer-events-auto relative z-1 flex h-[var(--composer-container-height,100%)] max-w-full flex-[var(--composer-container-flex,1)] flex-col">
                            <form action="" className="group/composer w-full">
                                <div>
                                    <div className="bg-token-bg-primary cursor-text overflow-clip bg-clip-padding p-2.5 contain-inline-size dark:bg-[#303030] grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow rounded-[28px]">
                                        <div className="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
                                            <div className="text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
                                                <textarea className="h-10"></textarea>
                                            </div>
                                        </div>
                                        <div className="[grid-area:leading]">
                                            test
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <div className="text-token-text-secondary relative mt-auto flex min-h-8 w-full items-center justify-center p-2 text-center text-xs [view-transition-name:var(--vt-disclaimer)] md:px-[60px]">
                    <div className="pointer-events-auto">
                        ChatGPT peut commettre des erreurs. Il est recommandé de
                        vérifier les informations importantes. Voir les{" "}
                        <a className="text-token-text-primary decoration-token-text-primary cursor-pointer underline">
                            préférences en matière de cookies
                        </a>
                        .
                    </div>
                </div>
            </footer>

            {/*  <ul className="space-y-2">
                {personas?.map((p) => (
                    <li
                        key={p.id}
                        className="rounded-xl border p-4 flex items-start justify-between"
                    >
                        <div>
                            <div className="font-medium">{p.name}</div>
                            {p.bio && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    {p.bio}
                                </p>
                            )}
                        </div>
                        <form
                            action={async () => {
                                "use server";
                                const { deletePersona } = await import(
                                    "../../app/personas/actions"
                                );
                                await deletePersona(p.id);
                            }}
                        >
                            <Button variant="ghost" type="submit">
                                Supprimer
                            </Button>
                        </form>
                    </li>
                ))}
                {(!personas || personas.length === 0) && (
                    <li className="text-sm text-muted-foreground">
                        Aucun persona pour l’instant.
                    </li>
                )}
            </ul>

            {!isSubscribed && (
                <p className="text-xs text-muted-foreground">
                    Personas restants : {remaining}
                </p>
            )} */}
        </main>
    );
}
