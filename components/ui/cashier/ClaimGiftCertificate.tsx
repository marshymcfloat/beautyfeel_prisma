// components/ui/cashier/ClaimGiftCertificate.tsx
"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useTransition,
  useRef,
} from "react";
import {
  validateGiftCertificateCode,
  createTransactionFromGiftCertificate,
  // Assuming GCValidationDetails is correctly defined and exported from ServerAction
  type GCValidationDetails,
} from "@/lib/ServerAction";
// Assuming CustomerWithRecommendations type is correctly defined and imported from Types
import type {
  CustomerWithRecommendations as CustomerData,
  TransactionProps, // Assuming TransactionProps is used elsewhere if not directly here
  AvailedServicesProps, // Assuming AvailedServicesProps is used elsewhere if not directly here
  RecommendedAppointmentData, // Assuming this is used in CustomerWithRecommendations
} from "@/lib/Types"; // Adjust the path if needed

import { PaymentMethod, Status } from "@prisma/client";

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

// --- Assuming relevant Type Definitions are defined and accessible (from your types file) ---
// Only pasting the ones directly relevant to this component's state and props for context.
// You should ensure the full definitions exist in your actual Types file.

// Example of what CustomerWithRecommendations might look like based on previous discussions:
// export type CustomerWithRecommendations = {
//   id: string;
//   name: string;
//   email: string | null;
//   recommendedAppointments: RecommendedAppointmentData[]; // Assuming this array exists
//   // Properties like totalPaid, nextAppointment, transactionHistory, purchasedGiftCertificates
//   // were removed from this type definition previously to match the object literal shape.
// };

// Example of what GCValidationDetails might look like (based on usage):
// export type GCValidationDetails = {
//   id: string; // GC ID
//   code: string; // GC Code
//   recipientName: string | null;
//   expiresAt: Date | null;
//   services: { id: string; title: string; }[]; // Array of associated services
//   serviceSets: { id: string; title: string; }[]; // Array of associated service sets
//   purchaserCustomer: { id: string; name: string; email: string | null; } | null; // Purchaser customer details
//   // etc.
// }

// You would import these from your actual Types file:
// import type { CustomerWithRecommendations, GCValidationDetails } from "@/lib/Types";

// --- End of assumed type definitions ---

const ClaimGiftCertificateComponent: React.FC = () => {
  const [gcCode, setGcCode] = useState("");
  const [gcDetails, setGcDetails] = useState<GCValidationDetails | null>(null);
  // The state type matches the CustomerWithRecommendations type definition
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(
    null,
  );
  const [bookedForDate, setBookedForDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, startClaimTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customerInputError, setCustomerInputError] = useState<string | null>(
    null,
  );

  const gcCodeInputRef = useRef<HTMLInputElement>(null);

  const handleCodeCheck = useCallback(async () => {
    if (!gcCode.trim()) {
      setError("Please enter a Gift Certificate code.");
      // Clear state related to previous checks
      setGcDetails(null);
      setSelectedCustomer(null);
      setSuccessMessage(null);
      setCustomerInputError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setGcDetails(null);
    setSelectedCustomer(null); // Reset selected customer

    const result = await validateGiftCertificateCode(gcCode);

    if (result.success && result.gcDetails) {
      setGcDetails(result.gcDetails);

      // --- MODIFIED: Construct the object literal passed to setSelectedCustomer ---
      // Only include properties that exist on the CustomerWithRecommendations type.
      // Assuming validateGiftCertificateCode returns purchaserCustomer with id, name, email,
      // and CustomerWithRecommendations requires id, name, email, and recommendedAppointments.
      if (result.gcDetails.purchaserCustomer) {
        setSelectedCustomer({
          id: result.gcDetails.purchaserCustomer.id,
          name: result.gcDetails.purchaserCustomer.name,
          email: result.gcDetails.purchaserCustomer.email,
          // Include recommendedAppointments, initializing as empty array as it's required by the type
          recommendedAppointments: [],
          // Removed properties not in CustomerWithRecommendations: totalPaid, nextAppointment, transactionHistory, purchasedGiftCertificates
        });
      } else {
        // If there's no purchaserCustomer, selectedCustomer remains null as initialized.
      }
      setSuccessMessage("Gift Certificate validated!"); // Indicate successful validation

      // --- FIX START: Use intermediate variable to access ref value ***
      if (gcCodeInputRef.current) {
        const inputElement = gcCodeInputRef.current; // Assign .current to a new variable
        inputElement.value = ""; // Access value on the new variable
      }
      // *** FIX END ***
    } else {
      // Handle validation failure
      setError(result.message || "Gift Certificate validation failed.");
      // Ensure state is reset on error too
      setGcDetails(null);
      setSelectedCustomer(null);
      setSuccessMessage(null);
    }
    setIsLoading(false);
  }, [gcCode]);

  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      setSelectedCustomer(customer);
      if (customer) setCustomerInputError(null); // Clear customer error if a customer is selected
    },
    [],
  );

  const handleClaimGC = useCallback(() => {
    if (!gcDetails) {
      setError("Please validate a Gift Certificate code first.");
      return;
    }
    if (!selectedCustomer) {
      setCustomerInputError("Please select a customer for this booking.");
      return;
    }
    if (!bookedForDate) {
      setError("Please select a date for the booking.");
      return;
    }

    // Clear previous messages and errors before starting claim
    setError(null);
    setSuccessMessage(null);
    setCustomerInputError(null);

    const claimData = {
      gcId: gcDetails.id,
      customerId: selectedCustomer.id,
      // Ensure bookedForDate string is in a format expected by the server action (ISO string)
      bookedForDate: new Date(bookedForDate).toISOString(),
    };

    startClaimTransition(async () => {
      const result = await createTransactionFromGiftCertificate(claimData);
      if (result.success) {
        setSuccessMessage(
          result.message +
            (result.transactionId ? ` (ID: ${result.transactionId})` : ""),
        );
        // Reset form state on successful claim
        setGcCode("");
        setGcDetails(null);
        setSelectedCustomer(null);
        setBookedForDate(new Date().toISOString().split("T")[0]);
        // Clear the input field using the ref
        if (gcCodeInputRef.current) gcCodeInputRef.current.value = "";
      } else {
        // Handle claim failure
        setError(result.message || "Failed to claim Gift Certificate.");
        // Optionally, reset specific parts of the form or keep details for retry
        // setGcDetails(null); // Maybe don't reset details on failure? Depends on UX.
        // setSelectedCustomer(null);
      }
    });
  }, [gcDetails, selectedCustomer, bookedForDate, startClaimTransition]);

  const resetForm = useCallback(() => {
    // Reset all form state
    setGcCode("");
    setGcDetails(null);
    setSelectedCustomer(null);
    setBookedForDate(new Date().toISOString().split("T")[0]);
    setError(null);
    setSuccessMessage(null);
    setCustomerInputError(null);
    // --- FIX START: Use intermediate variable to clear input field using ref ***
    if (gcCodeInputRef.current) {
      const inputElement = gcCodeInputRef.current; // Assign .current to a new variable
      inputElement.value = ""; // Access value on the new variable
    }
    // *** FIX END ***
  }, []); // No dependencies needed

  return (
    <div className="w-full space-y-4 bg-customOffWhite sm:space-y-6">
      <h2 className="flex items-center text-lg font-semibold text-customBlack sm:text-xl">
        <Gift className="mr-2 h-5 w-5 text-customDarkPink sm:h-6 sm:w-6" />{" "}
        Claim Gift Certificate
      </h2>

      {/* Error and Success Messages */}
      {error && (
        <div className="mb-4 flex items-start rounded border border-red-300 bg-red-100 p-3 text-sm text-red-700">
          <AlertCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{error}</div>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 flex items-start rounded border border-green-300 bg-green-100 p-3 text-sm text-green-700">
          <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{successMessage}</div>
        </div>
      )}

      {/* Code Check Section */}
      {!gcDetails && !successMessage && (
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
                value={gcCode}
                onChange={(e) => setGcCode(e.target.value.toUpperCase())}
                className={`placeholder-customGray-400 block w-full flex-1 rounded-md border p-2 uppercase text-customBlack focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink sm:rounded-none sm:rounded-l-md sm:text-sm ${error && !gcDetails && !successMessage ? "border-red-500" : "border-customGray"}`}
                placeholder="ENTER GC CODE"
                disabled={isLoading}
              />
              <Button
                onClick={handleCodeCheck}
                disabled={isLoading || !gcCode.trim()}
                className="relative mt-2 inline-flex w-full items-center justify-center space-x-2 rounded-md border border-customGray px-4 py-2 text-sm font-medium text-customDarkPink hover:bg-customGray/50 focus:border-customDarkPink focus:outline-none focus:ring-1 focus:ring-customDarkPink sm:-ml-px sm:mt-0 sm:w-auto sm:rounded-l-none sm:rounded-r-md"
              >
                {isLoading ? "Checking..." : "Check Code"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* GC Details & Booking Section */}
      {gcDetails && !successMessage && (
        <div className="space-y-4 border-t border-customGray/20 pt-4 sm:space-y-6">
          <div>
            <h3 className="sm:text-md text-base font-semibold text-customBlack">
              Gift Certificate Details (Code: {gcDetails.code})
            </h3>
            <div className="mt-2 space-y-1 rounded bg-customGray/5 p-3 text-sm text-customBlack/90">
              {gcDetails.services.length > 0 ||
              gcDetails.serviceSets.length > 0 ? (
                <ul className="list-inside list-disc">
                  {gcDetails.services.map((s) => (
                    <li key={s.id}>{s.title}</li>
                  ))}
                  {gcDetails.serviceSets.map((ss) => (
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
              initialValue={
                // Prioritize selectedCustomer name if already chosen, fallback to purchaser name
                selectedCustomer?.name ||
                gcDetails.purchaserCustomer?.name ||
                ""
              }
              error={customerInputError || undefined}
            />
            {customerInputError && (
              <p className="mt-1 text-xs text-red-500">{customerInputError}</p>
            )}
          </div>
          <div>
            <label htmlFor="bookedForDateModal" className={labelStyle}>
              Booking Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="bookedForDateModal"
              name="bookedForDateModal"
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

      {/* Success Message and Claim Another Button */}
      {successMessage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="primary"
            onClick={resetForm}
            className="w-full max-w-xs"
          >
            Claim Another
          </Button>
        </div>
      )}
    </div>
  );
};

// Wrap with React.memo for performance optimization
const ClaimGiftCertificate = React.memo(ClaimGiftCertificateComponent);
ClaimGiftCertificate.displayName = "ClaimGiftCertificate";

export default ClaimGiftCertificate;
