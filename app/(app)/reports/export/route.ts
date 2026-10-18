import { NextResponse, type NextRequest } from "next/server";
import { canSeeReports } from "@/lib/permissions";
import { buildCsv } from "@/lib/reports/build";
import { parseReportRange, parseReportTable } from "@/lib/reports/params";
import { dayKey } from "@/lib/time";
import { requireViewerContext } from "@/lib/viewer";

// GET /reports/export?from&to&table=delivered|open|contributions|teams: one of the report's tables as a CSV download.

/** A byte-order mark so spreadsheet apps read the file as UTF-8 (names, dashes) rather than a legacy code page. */
const UTF8_BOM = "﻿";

/** The same rows as the report page, for the same people (signed in, not a stakeholder), as a file. */
export async function GET(request: NextRequest) {
  const { viewer, org } = await requireViewerContext();
  if (!canSeeReports(viewer)) return new NextResponse("Reports are for the people who do the work in this workspace.", { status: 403 });

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const table = parseReportTable(raw);
  if (table === null) return new NextResponse("Ask for table=delivered, table=open, table=contributions or table=teams.", { status: 400 });

  const today = dayKey(new Date(), viewer.timezone);
  const range = parseReportRange(raw, today);
  const csv = await buildCsv(viewer, table, range, today);
  // The slug is lowercase letters, digits and dashes, so the name needs no escaping.
  const filename = `${org.slug}-${table}-${range.from}-to-${range.to}.csv`;
  return new NextResponse(UTF8_BOM + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
