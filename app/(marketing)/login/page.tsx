"use client";

import {
  ChangeEvent,
  useState,
  useCallback,
  FormEvent,
  useEffect,
} from "react";
import Button from "@/components/Buttons/Button";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [callbackUrl, setCallbackUrl] = useState("/");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({ username: "", password: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const cbUrlFromParams = searchParams?.get("callbackUrl");
    if (cbUrlFromParams) {
      setCallbackUrl(cbUrlFromParams);
    }
  }, [searchParams]);

  const handleInputChange = useCallback(
    (identifier: string, e: ChangeEvent<HTMLInputElement>) => {
      setInputs((prev) => ({ ...prev, [identifier]: e.target.value }));
      if (errorMessage) {
        setErrorMessage(null);
      }
    },
    [errorMessage],
  );

  const handleLoginSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setIsSubmitting(true);
      setErrorMessage(null);

      if (inputs.username.trim() === "" || inputs.password.trim() === "") {
        setErrorMessage("Username and password are required.");
        setIsSubmitting(false);
        return;
      }

      try {
        const result = await signIn("credentials", {
          username: inputs.username,
          password: inputs.password,
          redirect: false,
        });

        if (result?.ok && !result.error) {
          window.location.href = callbackUrl;
          return;
        } else {
          if (result?.error === "CredentialsSignin") {
            setErrorMessage("Invalid username or password.");
          } else {
            setErrorMessage(result?.error || "Login failed. Please try again.");
          }
        }
      } catch (error) {
        setErrorMessage(
          "An unexpected error occurred. Please try again later.",
        );
      }
      setIsSubmitting(false);
    },
    [inputs, callbackUrl],
  );

  return (
    <div className="fixed inset-0 z-40 flex min-h-screen items-center justify-center bg-gray-900/70 p-4 backdrop-blur-sm">
      {/* This div is the "dialog" card itself */}
      <div
        className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
        aria-labelledby="login-page-title"
        aria-modal="false"
      >
        {/* Optional: If you want a "back to home" or similar link, you could adapt the X button logic */}
        {/* For a standalone login page, a close button like the modal's might not make sense
            unless it navigates to a public home page.
        <button
          type="button"
          onClick={() => router.push('/')}
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          aria-label="Go to homepage"
        >
          <X size={22} />
        </button>
        */}

        <form onSubmit={handleLoginSubmit}>
          <h1
            id="login-page-title"
            className="mb-6 text-center text-2xl font-semibold tracking-tight text-gray-900"
          >
            Member Login
          </h1>

          {/* Username Input - Styled like your modal's input */}
          <div className="relative mb-5">
            <input
              id="username-loginpage"
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
                errorMessage ? "error-message-loginpage" : undefined
              }
            />
            <label
              htmlFor="username-loginpage"
              className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-2.5 scale-75 transform cursor-text text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-indigo-600"
            >
              Username
            </label>
          </div>

          {/* Password Input - Styled like your modal's input */}
          <div className="relative mb-6">
            <input
              id="password-loginpage"
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
                errorMessage ? "error-message-loginpage" : undefined
              }
            />
            <label
              htmlFor="password-loginpage"
              className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-2.5 scale-75 transform cursor-text text-sm text-gray-500 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-indigo-600"
            >
              Password
            </label>
          </div>

          {/* Error Message Display Area - Styled like your modal */}
          {errorMessage && (
            <p
              id="error-message-loginpage"
              className="mb-4 rounded-md bg-red-50 p-3 text-center text-sm text-red-600 ring-1 ring-inset ring-red-200"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          {/* Submit Button - Styled like your modal's button */}
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
      </div>
    </div>
  );
}
