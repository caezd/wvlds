import Logo from "@/components/logo";

export function SidebarLogo() {
  return (
    <div className="flex items-center justify-center w-9 h-9">
      <Logo className="size-6" accent="var(--accent)" />
    </div>
  );
}
