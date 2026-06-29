"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function LoginForm() {
    const t = useTranslations("auth");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // Si Supabase a redirigé ici avec des tokens d'invitation dans le fragment,
    // on transfère vers /auth/invite qui gère l'établissement de session
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes("type=invite")) {
            router.replace("/auth/invite" + hash);
        }
    }, [router]);

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const supabase = createClient();
        setIsLoading(true);
        setError(null);

        // Lire les valeurs depuis le DOM : l'autofill du navigateur ne
        // déclenche pas toujours onChange, laissant les states vides.
        const formData = new FormData(e.currentTarget);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: String(formData.get("email") || email),
                password: String(formData.get("password") || password),
            });
            if (error) throw error;
            // Update this route to redirect to an authenticated route. The user already has an active session.
            router.push("/home");
        } catch (error: unknown) {
            setError(
                error instanceof Error ? error.message : "An error occurred"
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h2 className="text-xl font-semibold md:text-2xl">Connexion</h2>
            <p className="text-muted-foreground">
                <Link href="/auth/sign-up" className="underline">
                    {t("newUser")}
                </Link>
            </p>
            <div className="my-4">
                <form onSubmit={handleLogin}>
                    <div className="mb-6 flex gap-3 flex-col">
                        <Label htmlFor="email">{t("email")}</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="mb-6 flex gap-3 flex-col relative">
                        <Label htmlFor="password">{t("password")}</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-between mb-6">
                        <Link
                            href="/auth/forgot-password"
                            className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                        >
                            {t("forgotPassword")}
                        </Link>
                    </div>
                    {error && (
                        <p className="text-sm text-destructive mb-4">{error}</p>
                    )}
                    <Button
                        type="submit"
                        className="w-full"
                        variant="default"
                        disabled={isLoading}
                    >
                        {t("signin")}
                    </Button>
                </form>
            </div>
        </>
    );
}
