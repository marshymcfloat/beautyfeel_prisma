"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useRef,
} from "react";
import {
  getEmailTemplatesAction,
  createEmailTemplateAction,
  updateEmailTemplateAction,
  deleteEmailTemplateAction,
} from "@/lib/ServerAction";
import { CacheKey, invalidateCache } from "@/lib/cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  PlusCircle,
  Edit3,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { EmailTemplate as EmailTemplateType } from "@prisma/client";

const inputStyle = (hasError?: boolean) =>
  `mt-1 block w-full rounded border ${hasError ? "border-red-500" : "border-customGray"} p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink disabled:bg-gray-100 disabled:cursor-not-allowed`;
const labelStyle = "block text-sm font-medium text-customBlack/80";
const errorMsgStyle =
  "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
const successMsgStyle =
  "mb-4 rounded border border-green-400 bg-green-100 p-3 text-sm text-green-700";
const fieldErrorStyle = "mt-1 text-xs text-red-600";
const modalErrorStyle =
  "text-sm text-red-600 mb-3 p-3 bg-red-100 border border-red-300 rounded";

const TEMPLATES_CACHE_KEY: CacheKey = "emailTemplates_ManageEmailTemplates";

const defaultPlaceholdersString = "{{customerName}}, {{customerEmail}}";

export default function ManageEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingTemplate, setEditingTemplate] =
    useState<EmailTemplateType | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const [pendingDeleteTemplateName, setPendingDeleteTemplateName] = useState<string | null>(null);

  const [isTemplateActive, setIsTemplateActive] = useState(true);

  const formRef = useRef<HTMLFormElement>(null);

  const resetFormState = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  const loadTemplates = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);
    if (forceRefresh) {
      invalidateCache(TEMPLATES_CACHE_KEY);
    }
    try {
      const fetchedTemplates = await getEmailTemplatesAction();
      setTemplates(fetchedTemplates);
    } catch (err: any) {
      setListError(err.message || "Failed to load email templates.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleRefresh = () => {
    loadTemplates(true);
  };

  const openModal = (mode: "add" | "edit", template?: EmailTemplateType) => {
    setModalMode(mode);
    resetFormState();

    if (mode === "edit" && template) {
      setEditingTemplate(template);
      setIsTemplateActive(template.isActive);
    } else {
      setEditingTemplate(null);
      setIsTemplateActive(true);
    }
    setIsModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      setEditingTemplate(null);
      resetFormState();
      setIsTemplateActive(true);
    } else {
      setTimeout(() => {
        const nameInput = formRef.current?.elements.namedItem("name");

        if (nameInput instanceof HTMLElement) {
          nameInput.focus();
        }
      }, 0);
    }
  }, [isModalOpen, resetFormState]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsTemplateActive(e.target.checked);
  };

  const validateForm = (formData: FormData): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    const name = formData.get("name") as string | null;
    const subject = formData.get("subject") as string | null;
    const body = formData.get("body") as string | null;

    if (!name?.trim()) errors.name = ["Name is required."];
    if (!subject?.trim()) errors.subject = ["Subject is required."];
    if (!body?.trim()) errors.body = ["Body is required."];

    return errors;
  };

  const handleSave = () => {
    if (!formRef.current) {
      setFormError("Form reference error. Please try again.");
      return;
    }

    const formData = new FormData(formRef.current);
    const validationErrors = validateForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setFormError("Please fix the errors in the form.");
      return;
    }

    setFormError(null);
    setListError(null);
    setSuccessMessage(null);

    const name = (formData.get("name") as string | null)?.trim();
    const subject = (formData.get("subject") as string | null)?.trim();
    const body = (formData.get("body") as string | null)?.trim();
    const placeholdersString = (
      formData.get("placeholders") as string | null
    )?.trim();

    const placeholdersArray = (placeholdersString ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const dataToSubmit = {
      name: name!,
      subject: subject!,
      body: body!,
      placeholders: placeholdersArray,
      isActive: isTemplateActive,
    };

    startTransition(async () => {
      try {
        let response;
        if (modalMode === "add") {
          response = await createEmailTemplateAction(dataToSubmit);
        } else {
          if (!editingTemplate?.id)
            throw new Error("Template ID is missing for update.");

          response = await updateEmailTemplateAction(
            editingTemplate.id,
            dataToSubmit,
          );
        }

        if (response.success) {
          const successMsg = response.message ||
            `Template ${modalMode === "add" ? "created" : "updated"} successfully!`;
          toast.success(`Template ${modalMode === "add" ? "created" : "updated"}`, {
            description: successMsg,
          });
          setFormError(null);
          setSuccessMessage(null);
          invalidateCache(TEMPLATES_CACHE_KEY);
          loadTemplates();
          closeModal();
        } else {
          const errorMsg = response.message || "An error occurred.";
          setFormError(errorMsg);
          setSuccessMessage(null);
          if (response.errors) setFieldErrors(response.errors);
          toast.error("Failed to save template", {
            description: errorMsg,
          });
        }
      } catch (err: any) {
        setFormError(err.message || "An unexpected error occurred.");
        setSuccessMessage(null);
      }
    });
  };

  const handleDeleteClick = (templateId: string, templateName: string) => {
    setPendingDeleteTemplateId(templateId);
    setPendingDeleteTemplateName(templateName);
    setDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteTemplateId) {
      setDeleteDialogOpen(false);
      return;
    }
    setListError(null);
    setSuccessMessage(null);
    setFormError(null);
    setDeleteDialogOpen(false);

    startTransition(async () => {
      try {
        const response = await deleteEmailTemplateAction(pendingDeleteTemplateId);
        if (response.success) {
          const successMsg = response.message || "Template deleted successfully!";
          toast.success("Template deleted", {
            description: successMsg,
          });
          setListError(null);
          invalidateCache(TEMPLATES_CACHE_KEY);
          loadTemplates();
        } else {
          const errorMsg = response.message || "Failed to delete template.";
          setListError(errorMsg);
          toast.error("Failed to delete template", {
            description: errorMsg,
          });
        }
      } catch (err: any) {
        const errorMsg = err.message || "An unexpected error occurred while deleting.";
        setListError(errorMsg);
        toast.error("Error", {
          description: errorMsg,
        });
      } finally {
        setPendingDeleteTemplateId(null);
        setPendingDeleteTemplateName(null);
      }
    });
  }, [pendingDeleteTemplateId, loadTemplates]);

  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top";

  const modalContainerStyle =
    "relative m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-customOffWhite p-6 shadow-xl";

  const isSaving = isPending;

  return (
    <div className="mx-auto max-w-6xl rounded-lg bg-customOffWhite p-4 shadow-md">
      {}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {" "}
        {}
        <h2 className="text-xl font-bold text-customBlack">
          Manage Email Templates
        </h2>
        {}
        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row">
          {" "}
          {}
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isSaving}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              size={16}
              className={`mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            <PlusCircle size={16} className="mr-2" />
            Add New Template
          </Button>
        </div>
      </div>

      {listError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {listError}
        </div>
      )}

      {isLoading && templates.length === 0 ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !listError && templates.length === 0 ? (
        <div className="my-8 rounded-md border border-yellow-400 bg-yellow-50 p-4 text-center">
          <AlertTriangle className="mx-auto mb-2 h-12 w-12 text-yellow-500" />
          <h3 className="text-lg font-medium text-yellow-800">
            No Email Templates Found
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            Get started by creating your first email template.
          </p>
          <Button
            onClick={() => openModal("add")}
            size="sm"
            className="mt-4"
            disabled={isSaving}
          >
            <PlusCircle size={16} className="mr-1" /> Create Template
          </Button>
        </div>
      ) : (
        <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
          <table className="min-w-full divide-y divide-customGray/20">
            <thead className="bg-customGray/5">
              <tr>
                <th className={thStyleBase}>Name</th>
                <th className={thStyleBase}>Subject</th>
                {}
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Active
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/10 bg-white">
              {templates.map((template) => (
                <tr
                  key={template.id}
                  className={`${!template.isActive ? "bg-gray-50 opacity-70" : ""} hover:bg-customLightBlue/10`}
                >
                  <td className={tdStyleBase}>{template.name}</td>
                  <td className={tdStyleBase}>{template.subject}</td>
                  {}
                  <td className={`${tdStyleBase} hidden md:table-cell`}>
                    <Badge
                      variant={template.isActive ? "default" : "secondary"}
                      className={
                        template.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {template.isActive ? "Yes" : "No"}
                    </Badge>
                  </td>
                  <td className={`${tdStyleBase} text-right`}>
                    <Button
                      onClick={() => openModal("edit", template)}
                      variant="ghost"
                      size="sm"
                      className="mr-2 h-8 w-8 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      title="Edit Template"
                      disabled={isSaving}
                    >
                      <Edit3 size={16} />
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(template.id, template.name)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                      title="Delete Template"
                      disabled={isSaving}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "add" ? "Add New" : "Edit"} Email Template
            </DialogTitle>
            <DialogDescription>
              {modalMode === "add"
                ? "Fill in the form below to create a new email template."
                : "Update the email template details below."}
            </DialogDescription>
          </DialogHeader>
          <form
            key={editingTemplate?.id ?? "new-template-form"}
            ref={formRef}
            onSubmit={(e) => e.preventDefault()}
            className="space-y-4"
          >
            {formError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

          {}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">
                Template Name <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="name"
                name="name"
                defaultValue={editingTemplate?.name ?? ""}
                required
                className={!!fieldErrors.name ? "border-destructive" : ""}
                disabled={isSaving}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
              />
              {fieldErrors.name && (
                <p id="name-error" className={fieldErrorStyle}>
                  {fieldErrors.name.join(", ")}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="subject">
                Subject <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                id="subject"
                name="subject"
                defaultValue={editingTemplate?.subject ?? ""}
                required
                className={!!fieldErrors.subject ? "border-destructive" : ""}
                disabled={isSaving}
                aria-invalid={!!fieldErrors.subject}
                aria-describedby={
                  fieldErrors.subject ? "subject-error" : undefined
                }
              />
              {fieldErrors.subject && (
                <p id="subject-error" className={fieldErrorStyle}>
                  {fieldErrors.subject.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="body">
              Body <span className="text-red-500">*</span> (HTML allowed)
            </Label>
            <Textarea
              rows={10}
              id="body"
              name="body"
              defaultValue={editingTemplate?.body ?? ""}
              required
              className={`resize-y ${!!fieldErrors.body ? "border-destructive" : ""}`}
              disabled={isSaving}
              aria-invalid={!!fieldErrors.body}
              aria-describedby={fieldErrors.body ? "body-error" : undefined}
            />
            {fieldErrors.body && (
              <p id="body-error" className={fieldErrorStyle}>
                {fieldErrors.body.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              You can use placeholders like <code>{"{{customerName}}"}</code>,{" "}
              <code>{"{{customerEmail}}"}</code>, etc. These will be replaced
              with actual data when sending.
            </p>
          </div>
          <div>
            <Label htmlFor="placeholders">
              Suggested Placeholders (comma-separated, for your reference)
            </Label>
            <Input
              type="text"
              id="placeholders"
              name="placeholders"
              defaultValue={
                editingTemplate?.placeholders.join(", ") ??
                defaultPlaceholdersString
              }
              className={!!fieldErrors.placeholders ? "border-destructive" : ""}
              disabled={isSaving}
              aria-invalid={!!fieldErrors.placeholders}
              aria-describedby={
                fieldErrors.placeholders ? "placeholders-error" : undefined
              }
            />
            {fieldErrors.placeholders && (
              <p id="placeholders-error" className={fieldErrorStyle}>
                {fieldErrors.placeholders.join(", ")}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Example:{" "}
              <code>
                {"{{customerName}}, {{customerEmail}}, {{bookingDate}}"}
              </code>
              . This helps you remember what placeholders this template uses.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isActive"
              checked={isTemplateActive}
              onCheckedChange={(checked) => setIsTemplateActive(checked)}
              disabled={isSaving}
            />
            <Label
              htmlFor="isActive"
              className="text-sm font-normal cursor-pointer"
            >
              Active
            </Label>
          </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              variant="outline"
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {modalMode === "add" ? "Creating" : "Updating"}...
                </>
              ) : (
                `${modalMode === "add" ? "Create" : "Update"} Template`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setPendingDeleteTemplateId(null);
          setPendingDeleteTemplateName(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Email Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the template{" "}
              <span className="font-semibold">{pendingDeleteTemplateName}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteTemplateId(null);
                setPendingDeleteTemplateName(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
