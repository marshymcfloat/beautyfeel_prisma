"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Buttons/Button";
import {
  Loader2,
  LogOut,
  KeyRound,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { updateUserPasswordAction } from "@/lib/ServerAction";

export default function ChangePasswordPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    feedback: string;
  }>({ score: 0, feedback: "" });

  // Password strength checker
  useEffect(() => {
    if (newPassword.length === 0) {
      setPasswordStrength({ score: 0, feedback: "" });
      return;
    }

    let score = 0;
    const feedback: string[] = [];

    if (newPassword.length >= 8) score += 1;
    else feedback.push("At least 8 characters");

    if (/[a-z]/.test(newPassword)) score += 1;
    else feedback.push("lowercase letter");

    if (/[A-Z]/.test(newPassword)) score += 1;
    else feedback.push("uppercase letter");

    if (/[0-9]/.test(newPassword)) score += 1;
    else feedback.push("number");

    if (/[^a-zA-Z0-9]/.test(newPassword)) score += 1;
    else feedback.push("special character");

    let strengthText = "";
    if (score <= 2) strengthText = "Weak";
    else if (score <= 3) strengthText = "Fair";
    else if (score <= 4) strengthText = "Good";
    else strengthText = "Strong";

    setPasswordStrength({
      score,
      feedback:
        feedback.length > 0 ? `Add: ${feedback.join(", ")}` : strengthText,
    });
  }, [newPassword]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "unauthenticated") {
      const callbackUrl =
        searchParams?.get("callbackUrl") || "/auth/change-password";
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    // If user doesn't need to change password, redirect to dashboard
    if (session?.user && session.user.mustChangePassword === false) {
      const callbackUrl = searchParams?.get("callbackUrl");
      const dashboardPath =
        callbackUrl || (session.user.id ? `/${session.user.id}` : "/");
      router.replace(dashboardPath);
      return;
    }
  }, [session, status, router, searchParams]);

  const handlePasswordUpdateClick = useCallback(async () => {
    setError(null);
    setSuccessMessage(null);

    // Enhanced client-side validation
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword.length > 500) {
      setError("Password is too long. Maximum 500 characters allowed.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please check and try again.");
      return;
    }

    // Check if user is authenticated
    if (!session?.user?.id) {
      setError("Session expired. Please log in again.");
      const callbackUrl =
        searchParams?.get("callbackUrl") || "/auth/change-password";
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateUserPasswordAction(newPassword);

      if (result.success) {
        setSuccessMessage(result.message || "Password updated successfully!");

        // Update session to reflect password change
        await updateSession({ mustChangePassword: false });

        // Clear form
        setNewPassword("");
        setConfirmPassword("");

        // Redirect after short delay to show success message
        setTimeout(() => {
          const callbackUrl = searchParams?.get("callbackUrl");
          const dashboardPath =
            callbackUrl || (session.user.id ? `/${session.user.id}` : "/");
          router.replace(dashboardPath);
          router.refresh(); // Refresh to ensure middleware sees updated session
        }, 2000);
      } else {
        setError(
          result.message || "Failed to update password. Please try again.",
        );
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("ChangePasswordPage submit error:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  }, [
    newPassword,
    confirmPassword,
    router,
    updateSession,
    session,
    searchParams,
  ]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-600" />
          <p className="text-lg font-medium text-slate-700">
            Loading session...
          </p>
          <p className="mt-2 text-sm text-slate-500">Please wait</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-red-50 to-pink-50 p-4 text-center">
        <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-red-500" />
        <p className="text-lg font-medium text-red-700">
          Authentication required
        </p>
        <p className="mt-2 text-sm text-red-600">Redirecting to login...</p>
      </div>
    );
  }

  if (
    session?.user &&
    (session.user.mustChangePassword === true ||
      typeof session.user.mustChangePassword === "undefined")
  ) {
    const getStrengthColor = () => {
      if (passwordStrength.score <= 2) return "bg-red-500";
      if (passwordStrength.score <= 3) return "bg-yellow-500";
      if (passwordStrength.score <= 4) return "bg-blue-500";
      return "bg-green-500";
    };

    const getStrengthTextColor = () => {
      if (passwordStrength.score <= 2) return "text-red-600";
      if (passwordStrength.score <= 3) return "text-yellow-600";
      if (passwordStrength.score <= 4) return "text-blue-600";
      return "text-green-600";
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-200/50 sm:p-8 lg:p-10">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
              <KeyRound className="h-8 w-8 text-white" />
            </div>
            <h1 className="mb-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
              Set Your New Password
            </h1>
            <p className="mb-2 text-sm text-gray-600 sm:text-base">
              For your security, please create a strong password for your
              account
            </p>
            <p className="text-sm font-medium text-indigo-600">
              {session.user.name || session.user.email || "Your Account"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={(e) => e.preventDefault()} className="mt-8 space-y-6">
            {/* New Password Field */}
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-semibold leading-6 text-gray-900"
              >
                New Password
              </label>
              <div className="relative mt-2">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-lg border-0 px-4 py-3 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm sm:leading-6"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError(null);
                  }}
                  disabled={isSubmitting || !!successMessage}
                  minLength={6}
                  maxLength={500}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting || !!successMessage}
                  aria-label={
                    showNewPassword ? "Hide password" : "Show password"
                  }
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {newPassword.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-600">
                      Password strength:
                    </span>
                    <span className={`font-semibold ${getStrengthTextColor()}`}>
                      {passwordStrength.score > 0 &&
                      passwordStrength.feedback.includes("Add")
                        ? passwordStrength.feedback
                        : passwordStrength.feedback}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full transition-all duration-300 ${getStrengthColor()}`}
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength.score
                            ? getStrengthColor().replace("bg-", "bg-")
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-2 text-xs text-gray-500">
                Must be at least 6 characters. Include uppercase, lowercase,
                numbers, and special characters for better security.
              </p>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-semibold leading-6 text-gray-900"
              >
                Confirm New Password
              </label>
              <div className="relative mt-2">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-lg border-0 px-4 py-3 pr-12 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm sm:leading-6"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  disabled={isSubmitting || !!successMessage}
                  minLength={6}
                  maxLength={500}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting || !!successMessage}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {confirmPassword.length > 0 &&
                newPassword !== confirmPassword && (
                  <p className="mt-2 text-xs text-red-600">
                    Passwords do not match
                  </p>
                )}
              {confirmPassword.length > 0 &&
                newPassword === confirmPassword &&
                newPassword.length >= 6 && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Passwords match
                  </p>
                )}
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="animate-in fade-in slide-in-from-top-2 rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-inset ring-red-200"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-600"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <p className="flex-1 font-medium">{error}</p>
                </div>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div
                className="animate-in fade-in slide-in-from-top-2 rounded-lg bg-green-50 p-4 text-sm text-green-800 ring-1 ring-inset ring-green-200"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                  <div className="flex-1">
                    <p className="font-semibold">{successMessage}</p>
                    <p className="mt-1 text-xs text-green-700">
                      Redirecting you to your dashboard...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-4">
              <Button
                type="button"
                onClick={handlePasswordUpdateClick}
                disabled={
                  isSubmitting ||
                  !!successMessage ||
                  newPassword.length < 6 ||
                  newPassword !== confirmPassword
                }
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-base font-semibold text-white shadow-lg transition-all hover:from-indigo-700 hover:to-purple-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                aria-live="polite"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Updating Password...
                  </span>
                ) : successMessage ? (
                  <span className="flex items-center justify-center">
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Password Updated!
                  </span>
                ) : (
                  "Set New Password"
                )}
              </Button>
            </div>
          </form>

          {/* Log Out Option */}
          {!successMessage && (
            <div className="mt-6 border-t border-gray-200 pt-6 text-center">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center justify-center gap-x-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
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

  // Fallback loading state
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-600" />
        <p className="text-lg font-medium text-slate-700">
          Preparing your experience...
        </p>
        <p className="mt-2 text-sm text-slate-500">Please wait a moment</p>
      </div>
    </div>
  );
}
