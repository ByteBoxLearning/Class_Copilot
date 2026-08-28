import { redirect } from "next/navigation";
import { getGuestSessionUser } from "@/lib/guest-auth";

// Simple entry point to bookmark/share — routes straight to the right place
// depending on whether there's already a guest session.
export default async function GuestIndexPage() {
  const guest = await getGuestSessionUser();
  redirect(guest ? "/guest/practice" : "/guest/signup");
}
