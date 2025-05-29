"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useRef,
  ChangeEvent,
} from "react";
import {
  getCustomersForEmailAction,
  sendEmailsAction,
  getActiveEmailTemplatesAction,
} from "@/lib/ServerAction";
import { CacheKey } from "@/lib/cache";
import { CustomerForEmail, EmailTemplateForSelection } from "@/lib/Types";
import Button from "@/components/Buttons/Button";
import { RefreshCw, Send } from "lucide-react";
import { invalidateCache } from "@/lib/cache";

const CUSTOMERS_CACHE_KEY: CacheKey = "customers_SendEmail";

const inputStyle = (hasError?: boolean) =>
  `mt-1 block w-full rounded border ${hasError ? "border-red-500" : "border-customGray"} p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed`;
const labelStyle = "block text-sm font-medium text-customBlack/80";
const checkboxStyle =
  "h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink";
const checkboxLabelStyle = "ml-2 block text-sm text-customBlack";
const errorMsgStyle =
  "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
const successMsgStyle =
  "mb-4 rounded border border-green-400 bg-green-100 p-3 text-sm text-green-700";
const fieldErrorStyle = "mt-1 text-xs text-red-600";
const sectionTitleStyle =
  "text-md font-semibold text-customBlack mb-3 border-b border-customGray/30 pb-2";

export default function ManageAdvertisements() {
  const [customers, setCustomers] = useState<CustomerForEmail[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isSending, startSendingTransition] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});

  const selectAllRef = useRef<HTMLInputElement>(null);

  const [emailTemplates, setEmailTemplates] = useState<
    EmailTemplateForSelection[]
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const loadCustomers = useCallback(async (forceRefresh = false) => {
    setIsLoadingCustomers(true);
    setListError(null);
    try {
      const fetchedCustomers = await getCustomersForEmailAction();
      setCustomers(fetchedCustomers);
      if (forceRefresh) {
        setSelectedCustomerIds([]);
      } else {
        setSelectedCustomerIds((prevSelected) =>
          prevSelected.filter((id) =>
            fetchedCustomers.some((c) => c.id === id),
          ),
        );
      }
    } catch (err: any) {
      setListError(err.message || "Failed to load customers.");
      setCustomers([]);
      setSelectedCustomerIds([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  }, []);

  const loadEmailTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
      const templates = await getActiveEmailTemplatesAction();
      setEmailTemplates(templates);
    } catch (err: any) {
      console.error("Failed to load email templates:", err);
      setTemplateError(err.message || "Failed to load email templates.");
      setEmailTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    loadEmailTemplates();
  }, [loadCustomers, loadEmailTemplates]);

  const allSelected =
    customers.length > 0 && selectedCustomerIds.length === customers.length;
  const indeterminate =
    selectedCustomerIds.length > 0 &&
    selectedCustomerIds.length < customers.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleRefresh = useCallback(() => {
    invalidateCache(CUSTOMERS_CACHE_KEY);
    loadCustomers(true);
  }, [loadCustomers]);

  const handleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedCustomerIds(customers.map((c) => c.id));
    } else {
      setSelectedCustomerIds([]);
    }
  };

  const handleCustomerSelect = (
    customerId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (event.target.checked) {
      setSelectedCustomerIds((prev) => [...prev, customerId]);
    } else {
      setSelectedCustomerIds((prev) => prev.filter((id) => id !== customerId));
    }
  };

  const handleTemplateChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const templateId = event.target.value;
    setSelectedTemplateId(templateId);
    if (templateId) {
      const selected = emailTemplates.find((t) => t.id === templateId);
      if (selected) {
        setSubject(selected.subject);
        setBody(selected.body);
        setFieldErrors((prev) => ({
          ...prev,
          subject: undefined,
          body: undefined,
        }));
      }
    } else {
    }
  };

  const validateForm = () => {
    let errors: Record<string, string[]> = {};
    if (!subject.trim()) {
      errors.subject = ["Subject is required."];
    }

    if (selectedCustomerIds.length === 0) {
      errors.recipients = ["Please select at least one recipient."];
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendEmail = () => {
    setSendError(null);
    setSendSuccess(null);
    setFieldErrors({});

    if (!validateForm()) {
      setSendError("Please fix the errors before sending.");
      return;
    }

    if (selectedCustomerIds.length === 0) {
      setSendError("Please select at least one recipient.");
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to send this email to ${selectedCustomerIds.length} customer(s)?`,
      )
    ) {
      return;
    }

    startSendingTransition(async () => {
      const res = await sendEmailsAction(selectedCustomerIds, subject, body);
      if (res.success) {
        setSendSuccess(res.message);
      } else {
        setSendError(res.message);
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl rounded-lg bg-customOffWhite p-4 shadow-md">
      <div className="mb-6 flex flex-col items-start justify-between sm:flex-row sm:items-center">
        <h2 className="text-xl font-bold text-customBlack">
          Send Customer Email
        </h2>
        <Button
          onClick={handleRefresh}
          disabled={isLoadingCustomers || isSending}
          size="sm"
          variant="outline"
          className="mt-3 w-full sm:mt-0 sm:w-auto"
        >
          <RefreshCw
            size={16}
            className={`mr-1 ${isLoadingCustomers ? "animate-spin" : ""}`}
          />
          Refresh Customer List
        </Button>
      </div>

      {listError && <p className={errorMsgStyle}>{listError}</p>}
      {templateError && <p className={errorMsgStyle}>{templateError}</p>}
      {sendError && <p className={errorMsgStyle}>{sendError}</p>}
      {sendSuccess && <p className={successMsgStyle}>{sendSuccess}</p>}

      {}
      <div className="mb-6 rounded border border-customGray/30 bg-white p-4">
        <h3 className={sectionTitleStyle}>Select Recipients</h3>
        {fieldErrors.recipients && (
          <p className={fieldErrorStyle}>{fieldErrors.recipients.join(", ")}</p>
        )}
        {isLoadingCustomers ? (
          <p className="py-4 text-center text-customBlack/70">
            Loading customers...
          </p>
        ) : customers.length === 0 ? (
          <p className="py-4 text-center text-customBlack/60">
            No customers with email addresses found.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto pr-2">
            <div className="sticky top-0 z-10 mb-2 flex items-center border-b border-customGray/30 bg-white pb-2">
              <input
                id="selectAll"
                type="checkbox"
                ref={selectAllRef}
                checked={allSelected}
                onChange={handleSelectAll}
                className={checkboxStyle}
                disabled={isLoadingCustomers || isSending}
              />
              <label
                htmlFor="selectAll"
                className={`${checkboxLabelStyle} font-semibold`}
              >
                Select All ({selectedCustomerIds.length}/{customers.length})
              </label>
            </div>
            <ul className="space-y-1">
              {customers.map((customer) => (
                <li
                  key={customer.id}
                  className={`flex items-center rounded p-1 ${selectedCustomerIds.includes(customer.id) ? "bg-customLightBlue/20" : ""}`}
                >
                  <input
                    id={`customer-${customer.id}`}
                    type="checkbox"
                    checked={selectedCustomerIds.includes(customer.id)}
                    onChange={(e) => handleCustomerSelect(customer.id, e)}
                    className={checkboxStyle}
                    disabled={isLoadingCustomers || isSending}
                  />
                  <label
                    htmlFor={`customer-${customer.id}`}
                    className={checkboxLabelStyle}
                  >
                    {customer.name} ({customer.email})
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {}
      <div className="mb-6 rounded border border-customGray/30 bg-white p-4">
        <h3 className={sectionTitleStyle}>Email Content</h3>

        {}
        <div className="mb-4">
          <label htmlFor="template" className={labelStyle}>
            Use Email Template (Optional)
          </label>
          <select
            id="template"
            value={selectedTemplateId}
            onChange={handleTemplateChange}
            className={inputStyle()}
            disabled={isSending || isLoadingTemplates}
          >
            <option value="">
              -- Select a Template or Compose Manually --
            </option>
            {emailTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          {isLoadingTemplates && (
            <p className="mt-1 text-xs text-gray-500">Loading templates...</p>
          )}
          {emailTemplates.length === 0 &&
            !isLoadingTemplates &&
            !templateError && (
              <p className="mt-1 text-xs text-gray-500">
                No active email templates found. You can create them in
                settings.
              </p>
            )}
        </div>
        {}

        <div className="mb-4">
          <label htmlFor="subject" className={labelStyle}>
            Subject*
          </label>
          <input
            type="text"
            id="subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);

              if (selectedTemplateId) setSelectedTemplateId("");
            }}
            className={inputStyle(!!fieldErrors.subject)}
            disabled={isSending}
          />
          {fieldErrors.subject && (
            <p className={fieldErrorStyle}>{fieldErrors.subject.join(", ")}</p>
          )}
        </div>

        <div>
          <label htmlFor="body" className={labelStyle}>
            Body (HTML/Plain Text - Placeholders like{" "}
            <code>{"{{customerName}}"}</code> will be replaced)
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);

              if (selectedTemplateId) setSelectedTemplateId("");
            }}
            rows={10}
            className={`${inputStyle(!!fieldErrors.body)} resize-y`}
            disabled={isSending}
            placeholder="Enter your email content here. You can use placeholders like {{customerName}} and {{customerEmail}}."
          ></textarea>
          {fieldErrors.body && (
            <p className={fieldErrorStyle}>{fieldErrors.body.join(", ")}</p>
          )}
        </div>
      </div>

      <div className="text-right">
        <Button
          onClick={handleSendEmail}
          disabled={
            isSending ||
            selectedCustomerIds.length === 0 ||
            isLoadingCustomers ||
            isLoadingTemplates
          }
          className="w-full sm:w-auto"
        >
          {isSending ? (
            <>
              <RefreshCw size={16} className="mr-2 animate-spin" /> Sending...
            </>
          ) : (
            <>
              <Send size={16} className="mr-2" /> Send Email
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
