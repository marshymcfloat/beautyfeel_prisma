// app/login/page.tsx
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
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({ username: "", password: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleInputChange(
    identifier: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    setInputs((prev) => ({ ...prev, [identifier]: e.target.value }));
    if (errorMessage) setErrorMessage(null);
  }

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
        console.log(
          `Attempting sign in (redirect: false). Target callback: ${callbackUrl}`,
        );
        const result = await signIn("credentials", {
          username: inputs.username,
          password: inputs.password,
          redirect: false, // Explicitly false
        });

        console.log("signIn (redirect: false) result:", result);

        if (result?.ok && !result.error) {
          // SUCCESS
          console.log(
            `Sign-in successful! Refreshing state then redirecting to: ${callbackUrl}`,
          );

          // Standard order: Push then refresh
          router.push(callbackUrl);
          router.refresh(); // <--- Crucial for updating client session state

          // No need to setIsSubmitting(false) as we are navigating away
          return;
        } else {
          // FAILURE
          console.error("Login failed (NextAuth Response):", result?.error);
          if (result?.error === "CredentialsSignin") {
            setErrorMessage("Invalid username or password.");
          } else {
            setErrorMessage(result?.error || "Login failed. Please try again.");
          }
        }
      } catch (error) {
        console.error("An unexpected error occurred during sign in:", error);
        setErrorMessage(
          "An unexpected error occurred. Please try again later.",
        );
      } finally {
        // Only set if we didn't successfully navigate
        setIsSubmitting(false);
      }
    },
    [inputs, router, callbackUrl],
  );

  // Login form JSX (no changes needed from your last version)
  return (
    <div className="w-full max-w-md rounded-lg border border-customDarkPink/50 bg-customOffWhite p-6 shadow-xl">
      <form onSubmit={handleLoginSubmit}>
        <h1 className="mb-8 text-center text-xl font-semibold uppercase tracking-wider text-customBlack">
          Login
        </h1>
        {/* Username Input */}
        <div className="relative mb-5">
          <input
            id="username"
            type="text"
            className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:opacity-50"
            placeholder=" "
            name="username"
            required
            value={inputs.username}
            onChange={(e) => handleInputChange("username", e)}
            disabled={isSubmitting}
            autoComplete="username"
            aria-describedby={errorMessage ? "error-message" : undefined}
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
            placeholder=" "
            name="password"
            required
            value={inputs.password}
            onChange={(e) => handleInputChange("password", e)}
            disabled={isSubmitting}
            autoComplete="current-password"
            aria-describedby={errorMessage ? "error-message" : undefined}
          />
          <label
            htmlFor="password"
            className="absolute left-3 top-3 z-10 origin-[0] -translate-y-3 scale-75 transform cursor-text text-sm text-customDarkPink/80 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-customDarkPink"
          >
            Password
          </label>
        </div>
        {/* Error Message */}
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
  );
}
