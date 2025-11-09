export default function Composer() {
    return (
        <form action="" className="group/composer w-full">
            <div>
                <div className="bg-token-bg-primary cursor-text overflow-clip bg-clip-padding p-2.5 contain-inline-size dark:bg-card-400 grid grid-cols-[auto_1fr_auto] [grid-template-areas:'header_header_header'_'primary_primary_primary'_'leading_footer_trailing'] shadow rounded-[28px]">
                    <div className="-my-2.5 flex min-h-14 items-center overflow-x-hidden px-1.5 [grid-area:primary] group-data-expanded/composer:mb-0 group-data-expanded/composer:px-2.5">
                        <div className="text-token-text-primary max-h-[max(30svh,5rem)] max-h-52 flex-1 overflow-auto [scrollbar-width:thin] default-browser vertical-scroll-fade-mask">
                            <textarea className="h-10"></textarea>
                        </div>
                    </div>
                    <div className="[grid-area:leading]">test</div>
                </div>
            </div>
        </form>
    );
}
