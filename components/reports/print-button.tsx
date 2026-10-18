"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// The browser's own print dialog; globals.css @media print strips the shell and every [data-print-hide].

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} data-print-hide>
      <Printer aria-hidden />
      Print
    </Button>
  );
}
