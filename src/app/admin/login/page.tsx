import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Admin sign in</h1>
      <LoginForm />
    </div>
  );
}
