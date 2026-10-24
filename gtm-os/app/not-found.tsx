import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-[15px] font-semibold">That page is not in the demo.</p>
      <Link href="/" prefetch={false} className="text-[13px] text-primary hover:underline">Back to the cockpit</Link>
    </div>
  );
}
