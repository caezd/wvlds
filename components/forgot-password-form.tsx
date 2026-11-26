"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { messageErreurAuth } from "@/lib/authErrors";

export function ForgotPasswordForm() {
    const t = useTranslations("auth");
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const supabase = createClient();
        setIsLoading(true);
        setError(null);

        try {
            // The url which will be included in the email. This URL needs to be configured in your redirect URLs in the Supabase dashboard at https://supabase.com/dashboard/project/_/auth/url-configuration
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/update-password`,
            });
            if (error) throw error;
            setSuccess(true);
        } catch (error: unknown) {
            setError(messageErreurAuth(error, t));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <h2 className="text-xl font-semibold md:text-2xl">
                {t("forgotPasswordTitle")}
            </h2>
            <div className="my-8">
                {success ? (
                    <p className="text-sm text-muted-foreground">
                        {t("resetSuccess")}
                    </p>
                ) : (
                    <form onSubmit={handleForgotPassword}>
                        <div className="mb-6 flex gap-3 flex-col">
                            <Label htmlFor="email">{t("email")}</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder={t("emailPlaceholder")}
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button
                            type="submit"
                            disabled={isLoading}
                        >
                            {isLoading ? t("sending") : t("sendResetEmail")}
                        </Button>
                    </form>
                )}
            </div>
        </>
    );
}
