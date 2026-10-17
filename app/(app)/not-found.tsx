import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Inside the app shell: a missing id and an id from another workspace look exactly the same. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="That doesn't exist, or you can't see it. If someone sent you the link, ask them to share it from inside your workspace."
        action={
          <Button asChild variant="outline">
            <Link href="/home">Back to home</Link>
          </Button>
        }
      />
    </div>
  );
}
