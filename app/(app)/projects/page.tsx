import { redirect } from "next/navigation";

// /projects moved into /home as the Projects tab (docs/PLAN.md §2). `?all=1` and anything else carries over.

export default async function ProjectsRedirect(props: PageProps<"/projects">) {
  const raw = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else value?.forEach((each) => params.append(key, each));
  }
  params.set("view", "projects");
  redirect(`/home?${params}`);
}
