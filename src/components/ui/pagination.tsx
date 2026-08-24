"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

const PAGE_SIZES = [10, 15, 20, 25, 50, 100];

export function Pagination({ page, perPage, total }: { page: number; perPage: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / perPage));

  function go(p: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  // Change page size — reset to page 1 so we never land on an out-of-range page.
  function setPerPage(n: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("perPage", String(n));
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
      <div className="flex items-center gap-3">
        <span>{total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}</span>
        <label className="flex items-center gap-1.5">
          <span className="text-xs">Per page</span>
          <Select
            value={String(perPage)}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="h-8 w-[4.5rem] py-0 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="tabular-nums">Page {page} / {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
