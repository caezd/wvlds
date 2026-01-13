// components/DateDisplay.tsx
// composant "server-friendly" (pas besoin de "use client")
export function DateDisplay({ value }: { value: string }) {
    const date = new Date(value); // "2025-11-20T03:18:33.667509+00:00"

    const formatted = new Intl.DateTimeFormat("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC", // 🔴 important : on fige sur l'UTC
    }).format(date);

    return <span>{formatted}</span>;
}

export default DateDisplay;
