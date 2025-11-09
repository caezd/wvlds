import Logo from "@/components/logo";

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex flex-col md:flex-row-reverse md:h-screen">
            <section className="flex items-start w-full px-4 mx-auto md:px-0 md:items-center md:w-1/3">
                <div className="w-full max-w-sm mx-auto md:mx-0 my-auto min-w-min relative md:-left-6 text-primary">
                    <div className="bg-background pt-4 py-4 flex items-center gap-1 text-4xl">
                        <Logo height={32} accent={"#F94B5F"} />
                    </div>
                </div>
            </section>
            <section className="justify-center px-4 md:px-0 md:flex md:w-2/3 md:border-r">
                <div className="w-full max-w-sm py-4 mx-auto my-auto min-w-min md:py-9 md:w-7/12">
                    {children}
                </div>
            </section>
        </div>
    );
}
