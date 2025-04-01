// LoginPage.tsx
"use client";

import { X } from "lucide-react";
// Removed useCallback from this import line if it's no longer needed elsewhere
import { ChangeEvent, useState, MouseEvent, useCallback } from "react";
import Button from "@/components/Buttons/Button";
import { loggingIn } from "@/lib/ServerAction";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // <-- Lint warning points here

  // REMOVED useCallback from handleInputChange
  // Define as a regular function within the component scope
  function handleInputChange(
    identifier: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    setInputs((prev) => ({
      ...prev,
      [identifier]: e.target.value,
    }));
    // Clear error when user starts typing again
    // This logic remains the same - it needs to clear the error.
    if (errorMessage) {
      setErrorMessage(null); // This state update WILL cause a re-render, which is intended.
    }
  }

  // Keep useCallback for handleLoggingIn as it's passed directly to Button onClick
  const handleLoggingIn = useCallback(async () => {
    setIsSubmitting(true);
    // Clear previous errors on new submission attempt
    // This state update WILL cause a re-render if errorMessage was not null. Intended.
    setErrorMessage(null);

    if (inputs.username.trim() === "" || inputs.password.trim() === "") {
      // This state update WILL cause a re-render. Intended.
      setErrorMessage("Username and password are required.");
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.append("username", inputs.username);
    formData.append("password", inputs.password);

    try {
      const response = await loggingIn(formData);
      if (response.success && response.accountID) {
        const targetPath = `/${response.accountID}`;
        console.log("Login success, scheduling navigation to:", targetPath);
        setTimeout(() => {
          console.log("Executing delayed navigation to:", targetPath);
          try {
            router.push(targetPath);
          } catch (pushError) {
            console.error("Error during router.push:", pushError);
            // This state update WILL cause a re-render. Intended.
            setErrorMessage("Failed to navigate after login. Please refresh.");
          }
        }, 0);
      } else {
        console.error("Login failed (Server Response):", response.message);
        // This state update WILL cause a re-render. Intended.
        setErrorMessage(response.message || "Login failed. Please try again.");
      }
    } catch (error) {
      console.error("An error occurred during login (Client Catch):", error);
      // This state update WILL cause a re-render. Intended.
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false); // This state update might cause a re-render if isSubmitting changes.
    }
  }, [inputs, router]); // Dependencies remain the same

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <dialog
        open
        className="relative w-[95%] max-w-md rounded-lg border border-customDarkPink/50 bg-customOffWhite p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={() => router.push("/")}
          className="absolute right-3 top-3 text-customDarkPink/70 transition-colors hover:text-customDarkPink"
          aria-label="Close login dialog"
        >
          <X size={24} />
        </button>

        <form>
          <h1 className="mb-8 text-center text-xl font-semibold uppercase tracking-wider text-customBlack">
            Login
          </h1>

          {/* Username Input */}
          <div className="relative mb-5">
            <input
              id="username"
              type="text"
              className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink"
              placeholder=" "
              name="username"
              required
              value={inputs.username}
              // Using the regular function via an inline arrow function
              onChange={(e) => handleInputChange("username", e)}
              disabled={isSubmitting}
              autoComplete="username"
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
              className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink"
              placeholder=" "
              name="password"
              required
              value={inputs.password}
              // Using the regular function via an inline arrow function
              onChange={(e) => handleInputChange("password", e)}
              disabled={isSubmitting}
              autoComplete="current-password"
            />
            <label
              htmlFor="password"
              className="absolute left-3 top-3 z-10 origin-[0] -translate-y-3 scale-75 transform cursor-text text-sm text-customDarkPink/80 duration-150 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-customDarkPink"
            >
              Password
            </label>
          </div>

          {/* Error Message Display Area */}
          {/* This conditional rendering IS tied to errorMessage state changes */}
          {errorMessage && (
            <p className="mb-4 text-center text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          )}

          {/* Submit Button */}
          <div className="mt-8 flex h-[50px] justify-center">
            <Button
              type="button"
              onClick={handleLoggingIn} // Passing the memoized handler
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Logging in..." : "Login"}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
