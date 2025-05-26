"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
  useRef,
} from "react";
// Ensure these imports point to your ServerAction file(s)
import {
  validateGiftCertificateCode,
  createTransactionFromGiftCertificate,
  type GCValidationDetails, // Make sure this type is exported from your ServerAction or Types file
} from "@/lib/ServerAction"; // Adjust the path if needed

// Ensure these imports point to your Types file
import type {
  CustomerWithRecommendations as CustomerData, // Make sure this type is defined and exported
} from "@/lib/Types"; // Adjust the path if needed

// Ensure these imports are correct if used directly (Status is used in the server action)
// import { PaymentMethod, Status } from "@prisma/client";

import CustomerInput from "@/components/Inputs/CustomerInput"; // Assuming CustomerInput component exists
import Button from "@/components/Buttons/Button"; // Assuming Button component exists
// Assuming Modal and DialogTitle components exist and are imported elsewhere if this is used within a modal structure
// import Modal from "@/components/Dialog/Modal";
// import DialogTitle from "@/components/Dialog/DialogTitle";

import {
  AlertCircle,
  CheckCircle,
  Gift,
  CalendarDays,
  RotateCcw,
} from "lucide-react"; // Added RotateCcw for reset

// --- Assuming these style constants are defined and accessible ---
const inputStyle =
  "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm text-customBlack focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink placeholder-customGray-500";
const labelStyle = "block text-sm font-medium text-customBlack/80";
// --- End of style constants ---

// --- Type Definitions (Ensure these match your actual Types file) ---
// Example GCValidationDetails based on server action usage:
// export type GCValidationDetails = {
//   id: string;
//   code: string;
//   recipientName: string | null;
//   expiresAt: Date | null;
//   usedAt: Date | null; // Needed for validation check in component
//   services: { id: string; title: string; price: number; }[]; // Need price for display/context?
//   serviceSets: { id: string; title: string; price: number; }[]; // Need price for display/context?
//   purchaserCustomer: { id: string; name: string; email: string | null; } | null;
// };

// Example CustomerWithRecommendations based on component usage:
// export type CustomerWithRecommendations = {
//   id: string;
//   name: string;
//   email: string | null;
//   recommendedAppointments: any[]; // Or match the actual RecommendedAppointmentData type
//   // Add other properties if needed by CustomerInput or other parts of your app
// };
// --- End of assumed type definitions ---

const ClaimGiftCertificateComponent: React.FC = () => {
  // State declarations
  const [gcCode, setGcCode] = useState("");
  const [gcDetails, setGcDetails] = useState<GCValidationDetails | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(
    null,
  );
  const [bookedForDate, setBookedForDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, startClaimTransition] = useTransition();

  // Messages and Errors
  const [error, setError] = useState<string | null>(null);
  // This will hold the final success message AFTER the claim transaction is created
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // This will hold the temporary message AFTER GC code validation
  const [validationSuccessMessage, setValidationSuccessMessage] = useState<
    string | null
  >(null);
  const [customerInputError, setCustomerInputError] = useState<string | null>(
    null,
  );

  // Ref declaration
  const gcCodeInputRef = useRef<HTMLInputElement>(null);

  // --- useCallback declarations ---

  // Declare resetForm first as it's used by handleClaimGC and render logic
  const resetForm = useCallback(() => {
    // Reset all form state
    setGcCode(""); // Clear state holding the input value
    setGcDetails(null); // Clear GC details to show code input section again
    setSelectedCustomer(null);
    setBookedForDate(new Date().toISOString().split("T")[0]); // Reset to today
    setError(null);
    setSuccessMessage(null); // Clear the final success message
    setValidationSuccessMessage(null); // Clear the temporary validation message
    setCustomerInputError(null);
    // Clear the input field using the ref
    if (gcCodeInputRef.current) {
      gcCodeInputRef.current.value = "";
      gcCodeInputRef.current.focus(); // Focus the input for the next code
    }
  }, []); // No dependencies needed as state setters and ref are stable

  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      setSelectedCustomer(customer);
      // Clear customer input error when a customer is selected (or selection is cleared)
      setCustomerInputError(null);
    },
    [],
  );

  const handleCodeCheck = useCallback(async () => {
    if (!gcCode.trim()) {
      setError("Please enter a Gift Certificate code.");
      // Clear state related to previous checks
      setGcDetails(null);
      setSelectedCustomer(null);
      setSuccessMessage(null);
      setValidationSuccessMessage(null); // Clear temporary message
      setCustomerInputError(null);
      // Ensure input is cleared if it was only whitespace
      if (gcCodeInputRef.current) gcCodeInputRef.current.value = "";
      setGcCode(""); // Also clear the state
      return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors/successes
    setSuccessMessage(null); // Clear any previous final success message
    setValidationSuccessMessage(null); // Clear previous temporary message
    setGcDetails(null); // Reset GC details
    setSelectedCustomer(null); // Reset selected customer
    setCustomerInputError(null); // Reset customer error

    const result = await validateGiftCertificateCode(gcCode);

    if (result.success && result.gcDetails) {
      // Check if GC is already used or expired client-side after fetch
      if (result.gcDetails.usedAt) {
        const usedDate = new Date(result.gcDetails.usedAt).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        );
        const usedTime = new Date(result.gcDetails.usedAt).toLocaleTimeString(
          "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          },
        );
        setError(
          `Gift Certificate already used on ${usedDate} at ${usedTime}.`,
        );
        setGcDetails(null); // Ensure details are cleared if already used
      } else if (
        result.gcDetails.expiresAt &&
        new Date(result.gcDetails.expiresAt) < new Date()
      ) {
        const expiryDate = new Date(
          result.gcDetails.expiresAt,
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        setError(`Gift Certificate expired on ${expiryDate}.`);
        setGcDetails(null); // Ensure details are cleared if expired
      } else {
        // Validation successful and GC is usable
        setGcDetails(result.gcDetails); // Set GC details to show the next section
        setValidationSuccessMessage("Gift Certificate validated!"); // Set temporary message
        setError(null); // Ensure no error message is displayed now

        // Attempt to pre-select the purchaser customer if available
        // This uses the CustomerInput's initialValue and onCustomerSelect callback
        if (result.gcDetails.purchaserCustomer) {
          // Call the handler directly to simulate selection and update parent state
          handleCustomerSelected({
            id: result.gcDetails.purchaserCustomer.id,
            name: result.gcDetails.purchaserCustomer.name,
            email: result.gcDetails.purchaserCustomer.email,
            recommendedAppointments: [], // Initialize as empty array if required by type
          });
        } else {
          setSelectedCustomer(null); // Explicitly set to null if no purchaser
        }
      }
    } else {
      // Handle validation failure
      setError(result.message || "Gift Certificate validation failed.");
      // Ensure related states are reset on error
      setGcDetails(null);
      setSelectedCustomer(null); // Clear customer state on validation failure
      setValidationSuccessMessage(null); // No validation success on failure
    }

    // Clear the input field after check, regardless of result, for next entry
    if (gcCodeInputRef.current) {
      gcCodeInputRef.current.value = "";
    }
    // Also clear the state holding the input value
    setGcCode("");

    setIsLoading(false);
  }, [gcCode, handleCustomerSelected]); // Dependency includes gcCode state and handleCustomerSelected

  const handleClaimGC = useCallback(() => {
    if (!gcDetails) {
      // Should not happen if UI state is managed correctly, but good safeguard
      setError("Internal error: GC details missing for claim.");
      return;
    }
    if (!selectedCustomer) {
      setCustomerInputError("Please select a customer for this booking.");
      // Focus the customer input field?
      return;
    }
    if (!bookedForDate) {
      setError("Please select a date for the booking."); // Use main error state for claim issues
      return;
    }

    // Clear previous messages and errors before starting claim
    setError(null);
    setSuccessMessage(null); // Clear previous final success message
    setCustomerInputError(null); // Clear customer input error
    setValidationSuccessMessage(null); // Clear validation message as we start claiming

    const claimData = {
      gcId: gcDetails.id,
      customerId: selectedCustomer.id,
      bookedForDate: bookedForDate, // Pass the YYYY-MM-DD string directly
    };

    startClaimTransition(async () => {
      const result = await createTransactionFromGiftCertificate(claimData);
      if (result.success) {
        // Set the final claim success message (includes transaction ID)
        setSuccessMessage(result.message);
        // Clear state related to the current claim process to transition UI
        setGcDetails(null); // Hide details section
        setSelectedCustomer(null); // Clear form data
        setBookedForDate(new Date().toISOString().split("T")[0]); // Reset date for next time
        // inputRef is already cleared by resetForm which will be called by "Claim Another" button
      } else {
        // Handle claim failure
        setError(result.message || "Failed to claim Gift Certificate.");
        // On claim failure, keep GC details, customer, date visible so user can retry or adjust.
        // Do NOT clear gcDetails, selectedCustomer, bookedForDate here.
        // Error state is already set above.
      }
      // isClaiming will automatically become false when this async function finishes
    });
    // Dependencies: gcDetails, selectedCustomer, bookedForDate, startClaimTransition are correct.
    // resetForm is NOT a dependency needed here as it's only called by the button onClick handler.
  }, [gcDetails, selectedCustomer, bookedForDate, startClaimTransition]);

  // --- Render JSX ---
  return (
    // The wrapper div with styling will be in AccountDashboardPage.tsx
    <div className="w-full space-y-4 sm:space-y-6">
      {" "}
      {/* Keep internal spacing */}
      <h2 className="flex items-center text-lg font-semibold text-customBlack sm:text-xl">
        <Gift className="mr-2 h-5 w-5 text-customDarkPink sm:h-6 sm:w-6" />{" "}
        Claim Gift Certificate
      </h2>
      {/* Error Message (for validation or claim failure) */}
      {error && (
        <div className="mb-4 flex items-start rounded border border-red-300 bg-red-100 p-3 text-sm text-red-700">
          <AlertCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{error}</div>
        </div>
      )}
      {/* Temporary Validation Success Message (after check, before claim) */}
      {validationSuccessMessage &&
        gcDetails &&
        !successMessage &&
        !isClaiming && (
          <div className="mb-4 flex items-start rounded border border-green-300 bg-green-100 p-3 text-sm text-green-700">
            <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
            <div>{validationSuccessMessage}</div>
          </div>
        )}
      {/* Final Claim Success Message */}
      {successMessage && (
        <div className="mb-4 flex items-start rounded border border-green-300 bg-green-100 p-3 text-sm text-green-700">
          <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{successMessage}</div>
        </div>
      )}
      {/* Section 1: Code Check Input (Visible initially and after reset/failure unless final success) */}
      {/* Show if no GC details are loaded AND no final success message is displayed AND not currently claiming */}
      {!gcDetails && !successMessage && !isClaiming && (
        <div className="space-y-3">
          <div>
            <label htmlFor="gcCodeInput" className={labelStyle}>
              Gift Certificate Code
            </label>
            <div className="mt-1 flex flex-col rounded-md shadow-sm sm:flex-row">
              <input
                ref={gcCodeInputRef}
                type="text"
                id="gcCodeInput"
                onChange={(e) => setGcCode(e.target.value.toUpperCase())}
                className={`placeholder-customGray-400 block w-full flex-1 rounded-md border p-2 uppercase text-customBlack focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink sm:rounded-none sm:rounded-l-md sm:text-sm ${error ? "border-red-500" : "border-customGray"}`}
                placeholder="ENTER GC CODE"
                disabled={isLoading || isClaiming} // Disable during check and claim
                autoFocus // Focus on load or after reset
              />
              <Button
                onClick={handleCodeCheck}
                // Disable if loading, claiming, no code entered, or final success message is already showing
                disabled={
                  isLoading ||
                  isClaiming ||
                  !gcCode.trim() ||
                  successMessage !== null
                }
                className="relative mt-2 inline-flex w-full items-center justify-center space-x-2 rounded-md border border-customGray px-4 py-2 text-sm font-medium text-customDarkPink hover:bg-customGray/50 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink sm:-ml-px sm:mt-0 sm:w-auto sm:rounded-l-none sm:rounded-r-md"
              >
                {isLoading ? "Checking..." : "Check Code"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Section 2: GC Details & Booking Section (Visible after successful validation, before successful claim) */}
      {/* Show if GC details are loaded AND no final success message is displayed AND not currently claiming */}
      {gcDetails && !successMessage && !isClaiming && (
        <div className="space-y-4 border-t border-customGray/20 pt-4 sm:space-y-6">
          <div>
            <h3 className="sm:text-md text-base font-semibold text-customBlack">
              Gift Certificate Details (Code: {gcDetails.code})
            </h3>
            <div className="mt-2 space-y-1 rounded bg-customGray/5 p-3 text-sm text-customBlack/90">
              {gcDetails.services?.length > 0 ||
              gcDetails.serviceSets?.length > 0 ? (
                <ul className="list-inside list-disc">
                  {gcDetails.services?.map((s) => (
                    <li key={s.id}>{s.title}</li>
                  ))}
                  {gcDetails.serviceSets?.map((ss) => (
                    <li key={ss.id}>{ss.title} (Set)</li>
                  ))}
                </ul>
              ) : (
                <p className="italic text-customBlack/60">
                  No specific services or sets listed.
                </p>
              )}
              {gcDetails.recipientName && (
                <p>Original Recipient: {gcDetails.recipientName}</p>
              )}
              {gcDetails.expiresAt && (
                <p>
                  Expires: {new Date(gcDetails.expiresAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className={labelStyle}>Customer for Booking</label>
            <CustomerInput
              onCustomerSelect={handleCustomerSelected}
              initialValue={selectedCustomer?.name || ""}
              error={customerInputError || undefined}
              key={selectedCustomer?.id || "no-customer"}
              disabled={isClaiming} // Disable customer input while claiming
            />
            {customerInputError && (
              <p className="mt-1 text-xs text-red-500">{customerInputError}</p>
            )}
          </div>
          <div>
            <label htmlFor="bookedForDateInput" className={labelStyle}>
              Booking Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="bookedForDateInput"
              name="bookedForDateInput"
              value={bookedForDate}
              onChange={(e) => setBookedForDate(e.target.value)}
              className={inputStyle}
              min={new Date().toISOString().split("T")[0]}
              required
              disabled={isClaiming}
            />
          </div>
          <div className="flex flex-col items-center space-y-2 pt-2 sm:flex-row sm:justify-end sm:space-x-3 sm:space-y-0">
            <Button
              variant="secondary"
              onClick={resetForm}
              disabled={isClaiming}
              className="order-2 w-full sm:order-1 sm:w-auto"
            >
              <RotateCcw size={16} className="mr-1.5" /> Use Different Code
            </Button>
            <Button
              onClick={handleClaimGC}
              disabled={isClaiming || !selectedCustomer || !bookedForDate}
              className="order-1 w-full sm:order-2 sm:w-auto"
            >
              <CalendarDays className="mr-2 h-5 w-5" />
              {isClaiming ? "Claiming & Booking..." : "Claim & Book Now"}
            </Button>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="primary"
            onClick={resetForm} // This button triggers the reset
            className="w-full max-w-xs"
          >
            Claim Another Gift Certificate
          </Button>
        </div>
      )}
      {isClaiming && (
        <div className="flex items-center justify-center space-x-2 pt-4 text-customBlack">
          <span>Processing Claim...</span>
        </div>
      )}
    </div>
  );
};

const ClaimGiftCertificate = React.memo(ClaimGiftCertificateComponent);
ClaimGiftCertificate.displayName = "ClaimGiftCertificate";

export default ClaimGiftCertificate;
