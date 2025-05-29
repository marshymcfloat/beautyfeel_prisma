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
  type GCValidationDetails,
} from "@/lib/ServerAction";

import type { CustomerWithRecommendations as CustomerData } from "@/lib/Types";

import CustomerInput from "@/components/Inputs/CustomerInput";
import Button from "@/components/Buttons/Button";

import {
  AlertCircle,
  CheckCircle,
  Gift,
  CalendarDays,
  RotateCcw,
} from "lucide-react";

const inputStyle =
  "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm text-customBlack focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink placeholder-customGray-500";
const labelStyle = "block text-sm font-medium text-customBlack/80";

const ClaimGiftCertificateComponent: React.FC = () => {
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

  const [error, setError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [validationSuccessMessage, setValidationSuccessMessage] = useState<
    string | null
  >(null);
  const [customerInputError, setCustomerInputError] = useState<string | null>(
    null,
  );

  const gcCodeInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setGcCode("");
    setGcDetails(null);
    setSelectedCustomer(null);
    setBookedForDate(new Date().toISOString().split("T")[0]);
    setError(null);
    setSuccessMessage(null);
    setValidationSuccessMessage(null);
    setCustomerInputError(null);

    if (gcCodeInputRef.current) {
      gcCodeInputRef.current.value = "";
      gcCodeInputRef.current.focus();
    }
  }, []);

  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      setSelectedCustomer(customer);

      setCustomerInputError(null);
    },
    [],
  );

  const handleCodeCheck = useCallback(async () => {
    if (!gcCode.trim()) {
      setError("Please enter a Gift Certificate code.");

      setGcDetails(null);
      setSelectedCustomer(null);
      setSuccessMessage(null);
      setValidationSuccessMessage(null);
      setCustomerInputError(null);

      if (gcCodeInputRef.current) gcCodeInputRef.current.value = "";
      setGcCode("");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setValidationSuccessMessage(null);
    setGcDetails(null);
    setSelectedCustomer(null);
    setCustomerInputError(null);

    const result = await validateGiftCertificateCode(gcCode);

    if (result.success && result.gcDetails) {
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
        setGcDetails(null);
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
        setGcDetails(null);
      } else {
        setGcDetails(result.gcDetails);
        setValidationSuccessMessage("Gift Certificate validated!");
        setError(null);

        if (result.gcDetails.purchaserCustomer) {
          handleCustomerSelected({
            id: result.gcDetails.purchaserCustomer.id,
            name: result.gcDetails.purchaserCustomer.name,
            email: result.gcDetails.purchaserCustomer.email,
            recommendedAppointments: [],
          });
        } else {
          setSelectedCustomer(null);
        }
      }
    } else {
      setError(result.message || "Gift Certificate validation failed.");

      setGcDetails(null);
      setSelectedCustomer(null);
      setValidationSuccessMessage(null);
    }

    if (gcCodeInputRef.current) {
      gcCodeInputRef.current.value = "";
    }

    setGcCode("");

    setIsLoading(false);
  }, [gcCode, handleCustomerSelected]);

  const handleClaimGC = useCallback(() => {
    if (!gcDetails) {
      setError("Internal error: GC details missing for claim.");
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

    setError(null);
    setSuccessMessage(null);
    setCustomerInputError(null);
    setValidationSuccessMessage(null);

    const claimData = {
      gcId: gcDetails.id,
      customerId: selectedCustomer.id,
      bookedForDate: bookedForDate,
    };

    startClaimTransition(async () => {
      const result = await createTransactionFromGiftCertificate(claimData);
      if (result.success) {
        setSuccessMessage(result.message);

        setGcDetails(null);
        setSelectedCustomer(null);
        setBookedForDate(new Date().toISOString().split("T")[0]);
      } else {
        setError(result.message || "Failed to claim Gift Certificate.");
      }
    });
  }, [gcDetails, selectedCustomer, bookedForDate, startClaimTransition]);

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {" "}
      {}
      <h2 className="flex items-center text-lg font-semibold text-customBlack sm:text-xl">
        <Gift className="mr-2 h-5 w-5 text-customDarkPink sm:h-6 sm:w-6" />{" "}
        Claim Gift Certificate
      </h2>
      {}
      {error && (
        <div className="mb-4 flex items-start rounded border border-red-300 bg-red-100 p-3 text-sm text-red-700">
          <AlertCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{error}</div>
        </div>
      )}
      {}
      {validationSuccessMessage &&
        gcDetails &&
        !successMessage &&
        !isClaiming && (
          <div className="mb-4 flex items-start rounded border border-green-300 bg-green-100 p-3 text-sm text-green-700">
            <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
            <div>{validationSuccessMessage}</div>
          </div>
        )}
      {}
      {successMessage && (
        <div className="mb-4 flex items-start rounded border border-green-300 bg-green-100 p-3 text-sm text-green-700">
          <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0" />{" "}
          <div>{successMessage}</div>
        </div>
      )}
      {}
      {}
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
                disabled={isLoading || isClaiming}
                autoFocus
              />
              <Button
                onClick={handleCodeCheck}
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
      {}
      {}
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
              disabled={isClaiming}
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
            onClick={resetForm}
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
