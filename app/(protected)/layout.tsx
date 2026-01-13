import { Menu, PanelRightClose } from "lucide-react";
import Logo from "@/components/logo";
import Sidebar from "@/components/sidebar/Sidebar";

export default function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex h-full w-full flex-1 transition-colors z-0">
        <div
          className="relative flex h-full w-full flex-row
         "
        >
          <aside
            className="relative z-21 h-full shrink-0 overflow-hidden max-md:hidden "
            style={{
              width: "var(--sidebar-width)",
            }}
          >
            <div className="relative flex h-full flex-col p-1.5">
              <div className="opacity-100 motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-linear h-full w-(--sidebar-width) overflow-x-clip overflow-y-auto text-clip whitespace-nowrap bg-token-bg-elevated-secondary">
                <nav className="group/scrollport relative flex h-full w-full flex-1 flex-col overflow-y-auto transition-opacity duration-500">
                  <header className="short:group-data-scrolled-from-top/scrollport:shadow-(--sharp-edge-top-shadow) bg-token-bg-elevated-secondary sticky top-0 z-30">
                    <div className="touch:px-1.5 px-2">
                      <div
                        id="sidebar-header"
                        className="h-header-height flex items-center justify-between"
                      >
                        <a
                          aria-label="Dom."
                          className="text-token-text-primary no-draggable hover:bg-hover-400 keyboard-focused:bg-hover-400 touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-hidden disabled:opacity-50"
                          href="/"
                          data-discover="true"
                        >
                          <Logo width={20} height={20} />
                        </a>
                        <div className="flex">
                          <button
                            className="text-token-text-tertiary no-draggable hover:bg-hover-400 keyboard-focused:bg-hover-400 touch:h-10 touch:w-10 flex h-9 w-9 items-center justify-center rounded-lg focus:outline-hidden disabled:opacity-50 no-draggable cursor-w-resize rtl:cursor-e-resize"
                            aria-expanded="true"
                            aria-controls="stage-slideover-sidebar"
                            aria-label="Fermer la barre latérale"
                            data-testid="close-sidebar-button"
                            data-state="closed"
                          >
                            <Menu className="scale-x-[-1]" size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </header>
                  {/* Sidebar content */}
                  <Sidebar />
                </nav>
              </div>
            </div>
          </aside>
          <section className="relative flex h-full max-w-full flex-1 flex-col p-1.5">
            <main className="transition-width relative h-full w-full flex-1 overflow-auto rounded-[6px] bg-background border border-border-soft">
              <div
                id="thread"
                className="group/thread @container/thread h-full w-full"
              >
                {children}
              </div>
            </main>
          </section>
        </div>
      </div>
    </div>
  );
}
