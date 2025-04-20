// app/login/page.tsx
"use client";

import { ChangeEvent, useState, useCallback } from "react";
import Button from "@/components/Buttons/Button";
import { loggingIn } from "@/lib/ServerAction"; // Assuming path is correct
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleInputChange(
    identifier: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    setInputs((prev) => ({
      ...prev,
      [identifier]: e.target.value,
    }));
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  const handleLoggingIn = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    if (inputs.username.trim() === "" || inputs.password.trim() === "") {
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
        router.push(targetPath); // Direct push is fine here
      } else {
        setErrorMessage(response.message || "Login failed. Please try again.");
      }
    } catch (error) {
      console.error("An error occurred during login (Client Catch):", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [inputs, router]);

  // REMOVED the outer 'flex min-h-screen...' div.
  // The component now returns the form container directly.
  // The LoginLayout will center this container.
  return (
    <div className="w-full max-w-md rounded-lg border border-customDarkPink/50 bg-customOffWhite p-6 shadow-xl">
      {/* Using onSubmit on the form is generally better practice */}
      <form
        onSubmit={(e) => {
          e.preventDefault(); // Prevent default form submission
          handleLoggingIn(); // Trigger login logic on submit
        }}
      >
        <h1 className="mb-8 text-center text-xl font-semibold uppercase tracking-wider text-customBlack">
          Login
        </h1>

        {/* Username Input */}
        <div className="relative mb-5">
          <input
            id="username"
            type="text"
            className="peer h-12 w-full rounded-md border border-customDarkPink/70 px-3 pt-3 text-customBlack shadow-sm outline-none transition-colors focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink"
            placeholder=" " // Keep space for label animation
            name="username"
            required
            value={inputs.username}
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
            placeholder=" " // Keep space for label animation
            name="password"
            required
            value={inputs.password}
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

        {/* Error Message */}
        {errorMessage && (
          <p className="mb-4 text-center text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        )}

        {/* Submit Button */}
        <div className="mt-8 flex h-[50px] justify-center">
          {/* Changed button type to submit */}
          <Button
            type="submit"
            // onClick={handleLoggingIn} // Removed onClick, handled by form onSubmit
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </Button>
        </div>
      </form>
    </div>
  );
}
