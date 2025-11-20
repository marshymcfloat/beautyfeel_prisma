"use client";

import { X, Loader2 } from "lucide-react";
import { ChangeEvent, useState, useCallback, FormEvent } from "react";
import Button from "@/components/Buttons/Button";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";

export default function InterceptedLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });

  // Use optimized shared authentication hook
  const { isSubmitting, errorMessage, handleLogin, clearError } = useAuth({
    onSuccess: (redirectUrl) => {
      // Clear form on success
      setInputs({ username: "", password: "" });

      // Optimized: Close modal first, then navigate
      // Use replace to avoid adding to history stack
      router.refresh();
      router.back();
      setTimeout(() => {
        router.push(redirectUrl);
      }, 150);
    },
  });

  const handleInputChange = useCallback(
    (identifier: string, e: ChangeEvent<HTMLInputElement>) => {
      setInputs((prev) => ({
        ...prev,
        [identifier]: e.target.value,
      }));

      if (errorMessage) {
        clearError();
      }
    },
    [errorMessage, clearError],
  );

  const handleLoginSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleLogin(inputs.username, inputs.password);
    },
    [inputs.username, inputs.password, handleLogin],
  );

  const closeModal = () => {
    router.back();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <dialog
        open
        className="relative w-[95%] max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8"
        aria-labelledby="login-dialog-title"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={closeModal}
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
              aria-live="polite"
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
