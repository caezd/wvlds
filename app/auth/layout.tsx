import Logo from "@/components/logo";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-background flex flex-col md:flex-row-reverse md:h-screen">
      <section className="flex items-start w-full px-4 mx-auto md:px-0 md:items-center md:w-1/3">
        <div className="w-full max-w-sm mx-auto md:mx-0 my-auto min-w-min relative md:-left-6 text-primary">
          <div className="bg-background pt-8 py-8 flex items-center gap-1 text-4xl">
            <Logo height={32} accent={"#F94B5F"} />
          </div>
          <div className="hidden md:flex items-start absolute gap-x-2 top-36 left-4 text-secondary">
            <div className="bg-background text-primary">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10.5 8C10.5 9.38071 9.38071 10.5 8 10.5C6.61929 10.5 5.5 9.38071 5.5 8C5.5 6.61929 6.61929 5.5 8 5.5C9.38071 5.5 10.5 6.61929 10.5 8Z"
                  stroke="currentColor"
                ></path>
              </svg>
            </div>
            <div className="max-w-60 -mt-0.5 text-muted-foreground">
              Wvlds est en beta.
            </div>
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
