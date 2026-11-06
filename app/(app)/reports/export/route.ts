import { NextResponse, type NextRequest } from "next/server";
import { canSeeReports } from "@/lib/permissions";
import { buildCsv } from "@/lib/reports/build";
import { projectScopeFor } from "@/lib/project-scope-server";
import { parseReportProject, parseReportRange, parseReportTable } from "@/lib/reports/params";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// GET /reports/export?from&to&table=delivered|open|contributions|scope[&project]: one of the report's tables as a CSV
// download, narrowed to a project the same way the page is (the link's project, else the navigation's scope).

/** A byte-order mark so spreadsheet apps read the file as UTF-8 (names, dashes) rather than a legacy code page. */
const UTF8_BOM = "﻿";

/** The same rows as the report page, for the same people (anyone signed in to the workspace), as a file. */
export async function GET(request: NextRequest) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) return new NextResponse("Reports are for the members of a workspace.", { status: 403 });

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const table = parseReportTable(raw);
  if (table === null) return new NextResponse("Ask for table=delivered, table=open, table=contributions or table=scope.", { status: 400 });

  const today = dayKey(new Date(), viewer.timezone);
  const range = parseReportRange(raw, today);
  const project = parseReportProject(raw) || (await projectScopeFor(viewer));
  const csv = await buildCsv(viewer, table, range, today, project);
  // The slug is lowercase letters, digits and dashes, and the project id is a UUID, so the name needs no escaping.
  const scope = project === "" ? "" : project === "none" ? "-no-project" : `-project-${project.slice(0, 8)}`;
  const filename = `${org.slug}-${table}${scope}-${range.from}-to-${range.to}.csv`;
  return new NextResponse(UTF8_BOM + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
