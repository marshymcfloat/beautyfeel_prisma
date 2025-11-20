"use client";

import { useCallback, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SignInResponse } from "next-auth/react";

interface UseAuthOptions {
  onSuccess?: (redirectUrl: string) => void;
  onError?: (error: string) => void;
}

interface UseAuthReturn {
  isSubmitting: boolean;
  errorMessage: string | null;
  handleLogin: (username: string, password: string) => Promise<void>;
  clearError: () => void;
}

/**
 * Optimized shared authentication hook for consistent login behavior
 * Handles authentication, error handling, and redirection logic
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      // Validation
      const trimmedUsername = username.trim();
      if (!trimmedUsername || !password) {
        const error = "Username and password are required.";
        setErrorMessage(error);
        options.onError?.(error);
        return;
      }

      if (trimmedUsername.length > 100 || password.length > 500) {
        const error = "Invalid credentials format.";
        setErrorMessage(error);
        options.onError?.(error);
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);

      let loginSucceeded = false;

      try {
        const result: SignInResponse | undefined = await signIn("credentials", {
          username: trimmedUsername,
          password: password,
          redirect: false,
        });

        if (result?.ok && !result.error) {
          loginSucceeded = true;
          // Get callback URL from search params or default to dashboard
          const callbackUrl = searchParams?.get("callbackUrl") || "/";
          
          // Clear any previous errors
          setErrorMessage(null);
          
          // Use the onSuccess callback if provided, otherwise use default redirect
          if (options.onSuccess) {
            options.onSuccess(callbackUrl);
            // Set submitting to false since onSuccess handles navigation
            // The callback should handle state cleanup if needed
            setIsSubmitting(false);
          } else {
            // Optimized: Use a single navigation with refresh
            // Refresh first to ensure session is updated, then navigate
            router.refresh();
            
            // Use setTimeout to ensure refresh completes before navigation
            setTimeout(() => {
              router.push(callbackUrl);
              setIsSubmitting(false);
            }, 100);
          }
          
          // Note: setIsSubmitting(false) is called in onSuccess callback or timeout above
        } else {
          // Handle different error types with user-friendly messages
          let error: string;
          if (result?.error === "CredentialsSignin") {
            error = "Invalid username or password. Please try again.";
          } else if (result?.error === "Configuration") {
            error = "Server configuration error. Please contact support.";
          } else {
            error = "Login failed. Please check your credentials and try again.";
          }
          
          setErrorMessage(error);
          options.onError?.(error);
          setIsSubmitting(false);
        }
      } catch (error) {
        console.error("[USE_AUTH] Unexpected error:", error);
        const errorMsg =
          "An unexpected error occurred. Please check your connection and try again.";
        setErrorMessage(errorMsg);
        options.onError?.(errorMsg);
        setIsSubmitting(false);
      }
    },
    [router, searchParams, options],
  );

  return {
    isSubmitting,
    errorMessage,
    handleLogin,
    clearError,
  };
}

