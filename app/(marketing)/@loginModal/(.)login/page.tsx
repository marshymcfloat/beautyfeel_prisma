// app/@authModal/(.)login/page.tsx
"use client";

import { X, Loader2 } from "lucide-react";
import {
  ChangeEvent,
  useState,
  useCallback,
  FormEvent,
  useEffect,
} from "react";
import Button from "@/components/Buttons/Button"; // Ensure this path is correct
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function InterceptedLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State for callbackUrl initialized in useEffect to ensure searchParams is ready
  const [callbackUrl, setCallbackUrl] = useState("/"); // Default callback URL

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // useEffect to safely access searchParams once the component has mounted
  useEffect(() => {
    const cbUrlFromParams = searchParams?.get("callbackUrl");
    if (cbUrlFromParams) {
      setCallbackUrl(cbUrlFromParams);
    }
    // If no callbackUrl in params, it will stick to the default "/"
  }, [searchParams]);

  const handleInputChange = useCallback(
    (identifier: string, e: ChangeEvent<HTMLInputElement>) => {
      setInputs((prev) => ({
        ...prev,
        [identifier]: e.target.value,
      }));
      // Clear error message when user starts typing again
      if (errorMessage) {
        setErrorMessage(null);
      }
    },
    [errorMessage], // Dependency array for useCallback
  );

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

      // No need for signInSuccessful flag if we always navigate or show error
      try {
        console.log(
          `[LOGIN_MODAL] Attempting sign in. Target callback for initial navigation: ${callbackUrl}`,
        );
        const result = await signIn("credentials", {
          username: inputs.username,
          password: inputs.password,
          redirect: false, // IMPORTANT: Handle redirect manually
        });

        console.log("[LOGIN_MODAL] signIn result:", result);

        if (result?.ok && !result.error) {
          console.log(
            `[LOGIN_MODAL] Sign-in successful. Navigating via window.location.href to: ${callbackUrl}. Middleware will handle final destination.`,
          );
          // CRITICAL CHANGE: Use window.location.href for a "fuller" navigation
          // that helps clear the intercepted route's modal state when middleware redirects.
          // Ensure callbackUrl is a relative path like "/" or "/dashboard" or an absolute path for your domain.
          // If callbackUrl might be an external URL, you'd need more careful handling.
          // For internal app navigation, this is generally fine.
          window.location.href = callbackUrl;

          // Since we are navigating away with window.location.href,
          // the component will unmount. No need to explicitly setIsSubmitting(false).
          // The 'return' here is mostly for logical flow, as window.location.href will take over.
          return;
        } else {
          // Handle NextAuth errors (e.g., invalid credentials)
          console.error("[LOGIN_MODAL] Login failed:", result?.error);
          if (result?.error === "CredentialsSignin") {
            setErrorMessage("Invalid username or password.");
          } else {
            // Use the error message from NextAuth or a generic one
            setErrorMessage(result?.error || "Login failed. Please try again.");
          }
        }
      } catch (error) {
        // Handle unexpected errors during the signIn process (e.g., network issues)
        console.error("[LOGIN_MODAL] Unexpected error during sign in:", error);
        setErrorMessage(
          "An unexpected error occurred. Please check your connection and try again.",
        );
      }
      // This will only be reached if signIn was not successful or an error occurred.
      setIsSubmitting(false);
    },
    [inputs, callbackUrl], // router is not strictly needed here anymore if using window.location.href
    // but keeping it doesn't harm if other parts of the component might use it.
    // If only for router.back(), it's fine.
  );

  const closeModal = () => {
    router.back(); // Standard way to close an intercepted route modal by user action
  };

  return (
    // Modal backdrop and container
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <dialog
        open // Use `open` attribute for dialog accessibility
        className="relative w-[95%] max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8"
        aria-labelledby="login-dialog-title"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={closeModal} // Use the closeModal function
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          aria-label="Close login dialog"
        >
          <X size={22} />
        </button>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit}>
          <h1
            id="login-dialog-title"
            className="mb-6 text-center text-2xl font-semibold tracking-tight text-gray-900"
          >
            Member Login
          </h1>

          {/* Username Input */}
          <div className="relative mb-5">
            <input
              id="username-modal"
              type="text"
              className="peer h-12 w-full rounded-md border border-gray-300 px-3 pt-3 text-gray-900 shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-50"
              placeholder=" "
              name="username"
              required
              value={inputs.username}
              onChange={(e) => handleInputChange("username", e)}
              disabled={isSubmitting}
              autoComplete="username"
              aria-describedby={
                errorMessage ? "error-message-modal" : undefined
              }
            />
            <label
              htmlFor="username-modal"
              className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-2.5 scale-75 transform cursor-text text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-indigo-600"
            >
              Username
            </label>
          </div>

          {/* Password Input */}
          <div className="relative mb-6">
            <input
              id="password-modal"
              type="password"
              className="peer h-12 w-full rounded-md border border-gray-300 px-3 pt-3 text-gray-900 shadow-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-50"
              placeholder=" "
              name="password"
              required
              value={inputs.password}
              onChange={(e) => handleInputChange("password", e)}
              disabled={isSubmitting}
              autoComplete="current-password"
              aria-describedby={
                errorMessage ? "error-message-modal" : undefined
              }
            />
            <label
              htmlFor="password-modal"
              className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-2.5 scale-75 transform cursor-text text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-indigo-600"
            >
              Password
            </label>
          </div>

          {errorMessage && (
            <p
              id="error-message-modal"
              className="mb-4 rounded-md bg-red-50 p-3 text-center text-sm text-red-600 ring-1 ring-inset ring-red-200"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <div className="mt-8">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
              aria-live="polite"
            >
              {isSubmitting ? (
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
