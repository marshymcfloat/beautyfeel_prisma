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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Send, Loader2 } from "lucide-react";
import { invalidateCache } from "@/lib/cache";

const CUSTOMERS_CACHE_KEY: CacheKey = "customers_SendEmail";

export default function ManageAdvertisements() {
  const [customers, setCustomers] = useState<CustomerForEmail[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isSending, startSendingTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomerIds(customers.map((c) => c.id));
    } else {
      setSelectedCustomerIds([]);
    }
  };

  const handleCustomerSelect = (customerId: string, checked: boolean) => {
    if (checked) {
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

  const handleSendEmailClick = () => {
    setFieldErrors({});

    if (!validateForm()) {
      toast.error("Please fix the errors before sending.", {
        description: "Check the form fields for validation errors.",
      });
      return;
    }

    if (selectedCustomerIds.length === 0) {
      toast.error("Please select at least one recipient.", {
        description: "You must select at least one customer to send the email.",
      });
      return;
    }

    setConfirmSendOpen(true);
  };

  const handleConfirmSend = () => {
    setConfirmSendOpen(false);

    startSendingTransition(async () => {
      try {
        const res = await sendEmailsAction(selectedCustomerIds, subject, body);
        if (res.success) {
          toast.success("Email sent successfully", {
            description:
              res.message ||
              `Email sent to ${selectedCustomerIds.length} customer(s).`,
          });
          // Clear form after successful send
          setSelectedCustomerIds([]);
          setSubject("");
          setBody("");
          setSelectedTemplateId("");
          setFieldErrors({});
        } else {
          toast.error("Failed to send email", {
            description: res.message || "An unexpected error occurred.",
          });
        }
      } catch (error: any) {
        toast.error("Error sending email", {
          description: error.message || "An unexpected error occurred.",
        });
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <CardTitle>Send Customer Email</CardTitle>
            <Button
              onClick={handleRefresh}
              disabled={isLoadingCustomers || isSending}
              size="sm"
              variant="outline"
            >
              {isLoadingCustomers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Customer List
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {listError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {listError}
            </div>
          )}
          {templateError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {templateError}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Select Recipients</CardTitle>
            </CardHeader>
            <CardContent>
              {fieldErrors.recipients && (
                <p className="mb-3 text-sm text-destructive">
                  {fieldErrors.recipients.join(", ")}
                </p>
              )}
              {isLoadingCustomers ? (
                <div className="space-y-2 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : customers.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No customers with email addresses found.
                </p>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 border-b bg-background pb-3">
                    <input
                      type="checkbox"
                      id="selectAll"
                      ref={selectAllRef}
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCustomerIds(customers.map((c) => c.id));
                        } else {
                          setSelectedCustomerIds([]);
                        }
                      }}
                      disabled={isLoadingCustomers || isSending}
                      className="h-4 w-4 cursor-pointer rounded border-primary text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Label
                      htmlFor="selectAll"
                      className="cursor-pointer font-semibold"
                    >
                      Select All ({selectedCustomerIds.length}/
                      {customers.length})
                    </Label>
                  </div>
                  <div className="space-y-2">
                    {customers.map((customer) => (
                      <div
                        key={customer.id}
                        className={`flex items-center gap-2 rounded-md p-2 ${
                          selectedCustomerIds.includes(customer.id)
                            ? "bg-primary/10"
                            : ""
                        }`}
                      >
                        <Checkbox
                          id={`customer-${customer.id}`}
                          checked={selectedCustomerIds.includes(customer.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCustomerIds((prev) => [
                                ...prev,
                                customer.id,
                              ]);
                            } else {
                              setSelectedCustomerIds((prev) =>
                                prev.filter((id) => id !== customer.id),
                              );
                            }
                          }}
                          disabled={isLoadingCustomers || isSending}
                        />
                        <Label
                          htmlFor={`customer-${customer.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          {customer.name} ({customer.email})
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Email Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template">Use Email Template (Optional)</Label>
                <select
                  id="template"
                  value={selectedTemplateId}
                  onChange={handleTemplateChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                  <p className="text-xs text-muted-foreground">
                    Loading templates...
                  </p>
                )}
                {emailTemplates.length === 0 &&
                  !isLoadingTemplates &&
                  !templateError && (
                    <p className="text-xs text-muted-foreground">
                      No active email templates found. You can create them in
                      settings.
                    </p>
                  )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">
                  Subject <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="text"
                  id="subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (selectedTemplateId) setSelectedTemplateId("");
                    setFieldErrors((prev) => ({
                      ...prev,
                      subject: undefined,
                    }));
                  }}
                  className={fieldErrors.subject ? "border-destructive" : ""}
                  disabled={isSending}
                  placeholder="Enter email subject"
                />
                {fieldErrors.subject && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.subject.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">
                  Body (HTML/Plain Text - Placeholders like{" "}
                  <code className="rounded bg-muted px-1">
                    {"{{customerName}}"}
                  </code>{" "}
                  will be replaced)
                </Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    if (selectedTemplateId) setSelectedTemplateId("");
                    setFieldErrors((prev) => ({
                      ...prev,
                      body: undefined,
                    }));
                  }}
                  rows={10}
                  className={fieldErrors.body ? "border-destructive" : ""}
                  disabled={isSending}
                  placeholder="Enter your email content here. You can use placeholders like {{customerName}} and {{customerEmail}}."
                />
                {fieldErrors.body && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.body.join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSendEmailClick}
              disabled={
                isSending ||
                selectedCustomerIds.length === 0 ||
                isLoadingCustomers ||
                isLoadingTemplates
              }
              size="lg"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send Email</DialogTitle>
            <DialogDescription>
              Are you sure you want to send this email to{" "}
              <span className="font-semibold">
                {selectedCustomerIds.length}
              </span>{" "}
              customer(s)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmSendOpen(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmSend} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
