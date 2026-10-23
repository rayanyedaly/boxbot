// app/_components/BrandMark.tsx — the BoxBot logo tile (sidebar, welcome card).

export function BrandMark() {
  return (
    <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
      <div className="h-[11px] w-[11px] rounded-[3px] border-2 border-white" />
    </div>
  );
}
