"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Button from "@/components/Buttons/Button"; // Assuming you have this Button component
import { Loader2, LogOut, KeyRound } from "lucide-react";
import { updateUserPasswordAction } from "@/lib/ServerAction";

export default function ChangePasswordPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Effect to handle redirection based on session state (remains the same)
  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (status === "unauthenticated") {
      console.log("ChangePasswordPage: Unauthenticated, redirecting to login.");
      router.replace("/login?callbackUrl=/auth/change-password");
      return;
    }
    if (session?.user && session.user.mustChangePassword === false) {
      console.log(
        "ChangePasswordPage: Password change not required, redirecting to user dashboard.",
      );
      router.replace(`/${session.user.id}`);
      return;
    }
    console.log("ChangePasswordPage: User on page. Session:", session);
  }, [session, status, router]);

  // Renamed from handleSubmit to handlePasswordUpdateClick for clarity
  const handlePasswordUpdateClick = useCallback(async () => {
    // No event parameter needed
    setError(null);
    setSuccessMessage(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateUserPasswordAction(newPassword);
      if (result.success) {
        setSuccessMessage(result.message);
        await updateSession({ mustChangePassword: false });

        setTimeout(() => {
          if (session?.user?.id) {
            router.replace(`/${session.user.id}`);
          } else {
            router.replace("/");
          }
        }, 2000);
      } else {
        setError(
          result.message || "Failed to update password. Please try again.",
        );
      }
    } catch (err) {
      console.error("ChangePasswordPage submit error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      // setIsSubmitting will be set to false only if there's no success message,
      // because on success we navigate away after a timeout.
      // If you want it to always reset, move it outside the setTimeout in success case.
      if (!successMessage) {
        // Or more simply, just always set it
        setIsSubmitting(false);
      }
    }
  }, [
    newPassword,
    confirmPassword,
    router,
    updateSession,
    session?.user?.id,
    successMessage,
  ]); // Added successMessage dependency

  // Loading and unauthenticated states remain the same
  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-sky-100 p-4 text-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
        <p className="text-lg text-slate-700">Loading session...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-red-100 p-4 text-center">
        <p className="text-lg text-red-700">
          You are not authenticated. Redirecting to login...
        </p>
      </div>
    );
  }

  if (
    session?.user &&
    (session.user.mustChangePassword === true ||
      typeof session.user.mustChangePassword === "undefined")
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-100 via-purple-50 to-indigo-100 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
          <div className="text-center">
            <KeyRound className="mx-auto mb-4 h-12 w-12 text-indigo-600" />
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Set Your New Password
            </h1>
            <p className="mb-8 text-sm text-gray-600">
              For security, please create a new password for your account,{" "}
              <span className="font-medium">
                {session.user.name || session.user.email}
              </span>
              .
            </p>
          </div>

          {/* The <form> tag is still useful for semantics and accessibility,
              but we prevent its default submission. */}
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium leading-6 text-gray-900"
              >
                New Password
              </label>
              <div className="mt-2">
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required // Still good for client-side UX, though our JS handles it
                  className="block w-full rounded-md border-0 px-3 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm sm:leading-6"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isSubmitting || !!successMessage} // Disable if submitting or on success
                  minLength={6}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Minimum 6 characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium leading-6 text-gray-900"
              >
                Confirm New Password
              </label>
              <div className="mt-2">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required // Still good for client-side UX
                  className="block w-full rounded-md border-0 px-3 py-2.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm sm:leading-6"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting || !!successMessage} // Disable if submitting or on success
                />
              </div>
            </div>

            {error && (
              <p
                className="rounded-md bg-red-50 p-3 text-center text-sm text-red-700 ring-1 ring-inset ring-red-200"
                role="alert"
              >
                {error}
              </p>
            )}
            {successMessage && (
              <p
                className="rounded-md bg-green-50 p-3 text-center text-sm text-green-700 ring-1 ring-inset ring-green-200"
                role="status"
              >
                {successMessage}
              </p>
            )}

            <div className="pt-2">
              <Button
                type="button" // CHANGE: Set type to "button" to prevent default form submission
                onClick={handlePasswordUpdateClick} // NEW: Call our handler on click
                disabled={isSubmitting || !!successMessage}
                className="w-full"
                aria-live="polite"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Updating Password...
                  </span>
                ) : (
                  "Set New Password"
                )}
              </Button>
            </div>
          </form>
          {!successMessage && ( // Log out button remains the same
            <div className="mt-8 text-center">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center justify-center gap-x-1.5 rounded-md px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                disabled={isSubmitting}
              >
                <LogOut className="h-4 w-4" />
                Log Out Instead
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-sky-100 p-4 text-center">
      <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
      <p className="text-lg text-slate-700">Preparing your experience...</p>
    </div>
  );
}
