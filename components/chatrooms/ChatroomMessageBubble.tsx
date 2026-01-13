import MarkdownRenderer from "@/components/MarkdownRenderer";
import { cn } from "@/lib/utils";

export function ChatroomMessageBubble({
  persona,
  message,
  isMine,
}: {
  persona?: { user_id?: string | null; name?: string | null } | null;
  message: { content: string };
  isMine: boolean;
}) {
  const author = persona?.name?.trim() ?? "";

  return (
    <div className={cn("flex w-full")}>
      <div>
        <MarkdownRenderer
          content={message.content}
          isMine
          className={cn(
            "text-sm",
            "prose-a:underline prose-a:underline-offset-4",
            "prose-hr:my-3",
          )}
        />
      </div>
    </div>
  );
}
