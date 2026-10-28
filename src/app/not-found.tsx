import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-2 py-10 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted">
        That page doesn&apos;t exist. Try the{" "}
        <Link href="/tournaments" className="text-accent hover:underline">
          tournament calendar
        </Link>{" "}
        or search.
      </p>
    </div>
  );
}
