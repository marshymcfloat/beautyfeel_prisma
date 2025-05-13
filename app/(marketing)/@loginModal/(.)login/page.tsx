// src/app/@authModal/(.)login/page.tsx (or your specific path)
"use client";

import { X, Loader2 } from "lucide-react"; // Import Loader2 for loading state
import {
  ChangeEvent,
  useState,
  useCallback,
  FormEvent, // Import FormEvent for form onSubmit
} from "react";
import Button from "@/components/Buttons/Button";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation"; // Import useSearchParams

export default function InterceptedLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Hook to get URL query parameters

  // Get the callbackUrl from the query string (set by middleware)
  // Default to '/' if not present (though middleware should always add it)
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Input change handler remains the same
  function handleInputChange(
    identifier: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    setInputs((prev) => ({
      ...prev,
      [identifier]: e.target.value,
    }));
    // Clear error message when user starts typing again
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  // Form submission handler
  const handleLoginSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); // Prevent default form submission

      setIsSubmitting(true);
      setErrorMessage(null); // Clear previous errors

      // Basic validation
      if (inputs.username.trim() === "" || inputs.password.trim() === "") {
        setErrorMessage("Username and password are required.");
        setIsSubmitting(false);
        return;
      }

      try {
        console.log(
          `Attempting sign in... Callback URL target: ${callbackUrl}`,
        );
        const result = await signIn("credentials", {
          username: inputs.username,
          password: inputs.password,
          redirect: false, // IMPORTANT: Handle redirect manually
          // No need to pass callbackUrl here when redirect: false,
          // we'll use the one from searchParams for manual redirect.
        });

        console.log("signIn result:", result);

        if (result?.ok && !result.error) {
          // Sign-in successful!
          console.log(`Sign-in successful. Redirecting to: ${callbackUrl}`);
          // Manually redirect to the callbackUrl provided by middleware (or default '/')
          router.push(callbackUrl);
          // IMPORTANT: Refresh the router to ensure the session state is updated
          // and the destination page reflects the logged-in state correctly.
          router.refresh();

          // No need to set isSubmitting false here, as we are navigating away.
          return; // Exit function after successful redirect push
        } else {
          // Handle NextAuth errors (e.g., invalid credentials)
          console.error("Login failed (NextAuth Response):", result?.error);
          if (result?.error === "CredentialsSignin") {
            setErrorMessage("Invalid username or password.");
          } else {
            // Use the error message from NextAuth or a generic one
            setErrorMessage(result?.error || "Login failed. Please try again.");
          }
        }
      } catch (error) {
        // Handle unexpected errors during the signIn process (e.g., network issues)
        console.error("An unexpected error occurred during sign in:", error);
        setErrorMessage(
          "An unexpected error occurred. Please try again later.",
        );
      } finally {
        // Ensure submission state is reset if we didn't redirect
        setIsSubmitting(false);
      }
    },
    [inputs, router, callbackUrl],
  ); // Include callbackUrl in dependencies

  return (
    // Modal backdrop and container
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      {" "}
      {/* Increased z-index just in case */}
      <dialog
        open // Use `open` attribute for dialog accessibility
        className="relative w-[95%] max-w-md rounded-lg border border-customDarkPink/50 bg-customOffWhite p-6 shadow-xl"
        aria-labelledby="login-dialog-title"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => router.back()} // Go back in history to close modal
          className="absolute right-3 top-3 rounded-full p-1 text-customDarkPink/70 transition-colors hover:bg-customGray/50 hover:text-customDarkPink focus:outline-none focus-visible:ring-2 focus-visible:ring-customDarkPink focus-visible:ring-offset-2"
          aria-label="Close login dialog"
        >
          <X size={24} />
        </button>

        {/* Login Form */}
        {/* Use form element with onSubmit */}
        <form onSubmit={handleLoginSubmit}>
          <h1
            id="login-dialog-title"
            className="mb-8 text-center text-xl font-semibold uppercase tracking-wider text-customBlack"
          >
            Login
          </h1>

          {/* Username Input */}
          <div className="relative mb-5">
            <input
              id="username"
              type="text"
              className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:opacity-50"
              placeholder=" " // Required for label animation
              name="username"
              required
              value={inputs.username}
              onChange={(e) => handleInputChange("username", e)}
              disabled={isSubmitting}
              autoComplete="username"
              aria-describedby={errorMessage ? "error-message" : undefined} // Link error message
            />
            <label
              htmlFor="username"
              className="absolute left-3 top-3 z-10 origin-[0] -translate-y-3 scale-75 transform cursor-text text-sm text-customDarkPink/80 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-customDarkPink"
            >
              Username
            </label>
          </div>

          {/* Password Input */}
          <div className="relative mb-8">
            <input
              id="password"
              type="password"
              className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:opacity-50"
              placeholder=" " // Required for label animation
              name="password"
              required
              value={inputs.password}
              onChange={(e) => handleInputChange("password", e)}
              disabled={isSubmitting}
              autoComplete="current-password"
              aria-describedby={errorMessage ? "error-message" : undefined} // Link error message
            />
            <label
              htmlFor="password"
              className="absolute left-3 top-3 z-10 origin-[0] -translate-y-3 scale-75 transform cursor-text text-sm text-customDarkPink/80 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-customDarkPink"
            >
              Password
            </label>
          </div>

          {/* Error Message Display Area */}
          {errorMessage && (
            <p
              id="error-message"
              className="mb-4 text-center text-sm text-red-600"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          {/* Submit Button */}
          <div className="mt-8 flex h-[50px] justify-center">
            <Button
              type="submit" // Changed to type="submit"
              disabled={isSubmitting}
              className="w-full" // Apply width utility directly
              aria-live="polite" // Announce changes for screen readers
            >
              {isSubmitting ? (
                // Loading indicator with accessible text
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Logging in...
                </span>
              ) : (
                "Login"
              )}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
