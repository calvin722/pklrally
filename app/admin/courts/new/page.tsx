import Link from "next/link";
import AddCourtForm from "@/components/admin/AddCourtForm";

export default function NewCourtPage() {
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/courts"
        className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60 hover:text-pickle"
      >
        ◀ Courts
      </Link>

      <h1 className="mt-3 font-display text-display-2xl font-extrabold text-bright">
        Add court
      </h1>
      <p className="mt-2 text-base text-white/60">
        Search for the court's address or name, then save.
      </p>

      <AddCourtForm />
    </div>
  );
}
