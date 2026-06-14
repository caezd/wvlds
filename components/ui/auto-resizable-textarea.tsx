"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"textarea"> & {
    minRows?: number;
    maxRows?: number; // hauteur max en lignes (scroll ensuite)
};

export const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, Props>(
    (
        {
            className,
            minRows = 1,
            maxRows = 6,
            rows = 1,
            value,
            onChange,
            ...props
        },
        ref
    ) => {
        const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

        // fusionne ref externe + interne
        React.useImperativeHandle(
            ref,
            () => innerRef.current as HTMLTextAreaElement
        );

        const resize = React.useCallback(() => {
            const el = innerRef.current;
            if (!el) return;

            const cs = window.getComputedStyle(el);
            const line = parseFloat(cs.lineHeight);
            const padY =
                parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
            const borderY =
                parseFloat(cs.borderTopWidth) +
                parseFloat(cs.borderBottomWidth);

            const minH = Math.ceil(line * minRows + padY + borderY);
            const maxH = Math.ceil(line * maxRows + padY + borderY);

            // reset pour recalc correct
            el.style.height = "auto";
            el.style.minHeight = `${minH}px`;
            el.style.maxHeight = `${maxH}px`;

            // scrollHeight inclut le padding (pas les bordures)
            const needed = Math.ceil(el.scrollHeight + borderY);
            const next = Math.max(minH, Math.min(needed, maxH));

            el.style.height = `${next}px`;
            el.style.overflowY = needed > maxH ? "auto" : "hidden";
        }, [minRows, maxRows]);

        // recalcul à chaque valeur/modif de style
        React.useLayoutEffect(() => {
            resize();
        }, [resize, value]);

        return (
            <textarea
                ref={innerRef}
                rows={rows}
                value={value as string | undefined}
                onChange={(e) => {
                    onChange?.(e);
                    resize();
                }}
                className={cn(className)}
                {...props}
            />
        );
    }
);

AutoResizeTextarea.displayName = "AutoResizeTextarea";
