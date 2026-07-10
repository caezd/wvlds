"use client";

export const PLANS = ["free", "subscribed", "lifetime"] as const;

export function PlanSelect({
  userId,
  currentPlan,
  action,
}: {
  userId: string;
  currentPlan: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <select
        name="plan"
        defaultValue={currentPlan}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="text-sm bg-transparent border border-border-soft rounded px-2 py-1 cursor-pointer"
      >
        {PLANS.map((pl) => (
          <option key={pl} value={pl}>{pl}</option>
        ))}
      </select>
    </form>
  );
}
