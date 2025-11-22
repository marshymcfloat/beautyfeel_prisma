"use client";
import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
} from "react";
import {
  createServiceSetAction,
  updateServiceSetAction,
  deleteServiceSetAction,
} from "@/lib/ServerAction";
import type {
  ServiceSet as PrismaServiceSet,
  Service as PrismaService,
} from "@prisma/client";
import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, RefreshCw, Loader2 } from "lucide-react";

type Service = Pick<PrismaService, "id" | "title" | "price">;
type ServiceSet = PrismaServiceSet & { services?: Service[] };

const fetchServiceSets = async (): Promise<ServiceSet[]> => {
  const response = await fetch("/api/service-sets");
  if (!response.ok)
    throw new Error(`Failed to fetch service sets: ${response.statusText}`);
  return response.json();
};

const fetchAvailableServices = async (): Promise<Service[]> => {
  const response = await fetch("/api/services");
  if (!response.ok)
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  return response.json();
};

const SERVICE_SETS_CACHE_KEY: CacheKey = "serviceSets_ManageServiceSets";
const AVAILABLE_SERVICES_CACHE_KEY: CacheKey =
  "availableServices_ManageServiceSets";

export default function ManageServiceSets() {
  const [serviceSets, setServiceSets] = useState<ServiceSet[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<ServiceSet | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteSetId, setPendingDeleteSetId] = useState<string | null>(null);
  const [pendingDeleteSetTitle, setPendingDeleteSetTitle] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);

    let setsData = !forceRefresh
      ? getCachedData<ServiceSet[]>(SERVICE_SETS_CACHE_KEY)
      : null;
    let servicesData = !forceRefresh
      ? getCachedData<Service[]>(AVAILABLE_SERVICES_CACHE_KEY)
      : null;

    if (setsData && servicesData && !forceRefresh) {
      setServiceSets(setsData);
      setAvailableServices(servicesData);
      setIsLoading(false);
      return;
    }

    try {
      const promises: [Promise<ServiceSet[]>, Promise<Service[]>] = [
        setsData && !forceRefresh
          ? Promise.resolve(setsData)
          : fetchServiceSets().then((data) => {
              setCachedData<ServiceSet[]>(SERVICE_SETS_CACHE_KEY, data);
              return data;
            }),
        servicesData && !forceRefresh
          ? Promise.resolve(servicesData)
          : fetchAvailableServices().then((data) => {
              setCachedData<Service[]>(AVAILABLE_SERVICES_CACHE_KEY, data);
              return data;
            }),
      ];
      const [fetchedSets, fetchedAvailServices] = await Promise.all(promises);
      setServiceSets(fetchedSets);
      setAvailableServices(fetchedAvailServices);
    } catch (err: any) {
      console.error("Failed to load service set data:", err);
      setListError(err.message || "Failed to load data. Please refresh.");
      setServiceSets(setsData || []);
      setAvailableServices(servicesData || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const handleAdd = () => {
    setEditingSet(null);
    setFormError(null);
    setIsModalOpen(true);
    formRef.current?.reset();
  };

  const handleEdit = (serviceSet: ServiceSet) => {
    setEditingSet(serviceSet);
    setFormError(null);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (isModalOpen) {
      formRef.current?.reset();
      if (editingSet) {
      }
    } else {
      setEditingSet(null);
    }
  }, [isModalOpen, editingSet]);

  const handleDeleteClick = (serviceSet: ServiceSet) => {
    setPendingDeleteSetId(serviceSet.id);
    setPendingDeleteSetTitle(serviceSet.title);
    setDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(async () => {
    if (!pendingDeleteSetId) {
      setDeleteDialogOpen(false);
      return;
    }
    setListError(null);
    setDeleteDialogOpen(false);
    startTransition(async () => {
      try {
        const result = await deleteServiceSetAction(pendingDeleteSetId);
        if (!result.success) {
          const errorMsg = result.message || "Failed to delete service set.";
          setListError(errorMsg);
          toast.error("Failed to delete service set", {
            description: errorMsg,
          });
        } else {
          toast.success("Service set deleted", {
            description: "The service set has been successfully deleted.",
          });
          invalidateCache(SERVICE_SETS_CACHE_KEY);
          await loadData();
        }
      } catch (error: any) {
        const errorMsg = error.message || "An unexpected error occurred.";
        setListError(errorMsg);
        toast.error("Error", {
          description: errorMsg,
        });
      } finally {
        setPendingDeleteSetId(null);
        setPendingDeleteSetTitle(null);
      }
    });
  }, [pendingDeleteSetId, loadData]);

  const handleSave = () => {
    if (!formRef.current) {
      setFormError("Form reference error.");
      return;
    }
    setFormError(null);
    const formData = new FormData(formRef.current);

    if (!formData.get("title") || !formData.get("price")) {
      setFormError("Set Title and Set Price are required.");
      return;
    }
    if (Number(formData.get("price")) < 0) {
      setFormError("Price cannot be negative.");
      return;
    }
    const selectedServiceIds = formData.getAll("serviceIds");
    if (selectedServiceIds.length === 0) {
      setFormError("Please select at least one service.");
      return;
    }

    startTransition(async () => {
      try {
        const action = editingSet
          ? updateServiceSetAction(editingSet.id, formData)
          : createServiceSetAction(formData);
        const result = await action;

        if (result.success) {
          setIsModalOpen(false);

          invalidateCache(SERVICE_SETS_CACHE_KEY);
          await loadData();
          toast.success("Service set saved", {
            description: result.message || "The service set has been saved successfully.",
          });
        } else {
          let errorMsg = result.message;
          if (result.errors) {
            const fieldErrors = Object.entries(result.errors)
              .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
              .join("; ");
            errorMsg += ` (${fieldErrors})`;
          }
          setFormError(errorMsg);
          toast.error("Failed to save service set", {
            description: errorMsg,
          });
        }
      } catch (err) {
        console.error("Unexpected error during save action:", err);
        setFormError("An unexpected error occurred during save.");
      }
    });
  };

  const closeModal = () => setIsModalOpen(false);
  const isSaving = isPending;

  const thStyleBase =
    "px-4 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-4 py-2 text-sm text-customBlack/90 align-top";
  const inputStyle =
    "mt-1 block w-full rounded border border-customGray p-2 shadow-sm sm:text-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink";
  const labelStyle = "block text-sm font-medium text-customBlack/80";
  const listErrorMsgStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const modalErrorStyle = "text-xs text-red-600 mb-3";
  const checkboxStyle =
    "h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink";
  const checkboxLabelStyle = "ml-2 block text-sm text-customBlack";

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Service Sets
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isPending}
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              size={16}
              className={`mr-1 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isLoading || isPending}
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus size={16} className="mr-1" /> Add New Set
          </Button>
        </div>
      </div>
      {listError && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {listError}
        </div>
      )}
      <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
        {isLoading && serviceSets.length === 0 ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !listError && serviceSets.length === 0 ? (
          <p className="py-10 text-center text-customBlack/60">
            No service sets found.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyleBase}>Set Title</th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Set Price
                </th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>
                  Included Services
                </th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {serviceSets.map((set) => (
                <tr key={set.id} className="hover:bg-customLightBlue/10">
                  <td className={`${tdStyleBase} font-medium`}>{set.title}</td>
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap sm:table-cell`}
                  >
                    {set.price}
                  </td>
                  <td
                    className={`${tdStyleBase} hidden max-w-xs whitespace-normal break-words sm:table-cell`}
                  >
                    {set.services && set.services.length > 0 ? (
                      set.services.map((s: Service) => s.title).join(", ")
                    ) : (
                      <span className="italic text-gray-400">None</span>
                    )}
                  </td>
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    <Button
                      onClick={() => handleEdit(set)}
                      disabled={isPending}
                      variant="ghost"
                      size="sm"
                      className="mr-2 h-8 w-8 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      title="Edit Set"
                    >
                      <Edit3 size={16} />
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(set)}
                      disabled={isPending}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                      title="Delete Set"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSet ? "Edit Service Set" : "Add New Service Set"}
            </DialogTitle>
            <DialogDescription>
              {editingSet
                ? "Update the service set details below."
                : "Fill in the form below to create a new service set."}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </div>
          )}
          <form
            key={editingSet?.id || "new-set"}
            ref={formRef}
            onSubmit={(e) => e.preventDefault()}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="title">
                Set Title <span className="text-red-500">*</span>
              </Label>
              <Input
                type="text"
                name="title"
                id="title"
                required
                defaultValue={editingSet?.title ?? ""}
                disabled={isSaving}
              />
            </div>
            <div>
              <Label htmlFor="price">
                Set Price (in cents) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                name="price"
                id="price"
                required
                min="0"
                step="1"
                defaultValue={editingSet?.price ?? ""}
                disabled={isSaving}
              />
            </div>
            <div>
              <Label>
                Include Services <span className="text-red-500">*</span>
              </Label>
              <ScrollArea className="mt-2 max-h-60 rounded-md border border-input bg-background p-3">
                {isLoading && availableServices.length === 0 ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : availableServices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No services available.</p>
                ) : (
                  <div className="space-y-2">
                    {availableServices.map((service: Service) => (
                      <div key={service.id} className="flex items-center space-x-2">
                        <input
                          id={`service-${service.id}`}
                          name="serviceIds"
                          type="checkbox"
                          value={service.id}
                          defaultChecked={editingSet?.services?.some(
                            (s: Service) => s.id === service.id,
                          )}
                          disabled={isSaving}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <Label
                          htmlFor={`service-${service.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {service.title}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({service.price})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="mt-1 text-xs text-muted-foreground">
                Select one or more services.
              </p>
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
            <Button
              type="button"
              onClick={handleSave}
              disabled={
                isSaving || (isLoading && availableServices.length === 0)
              }
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingSet ? (
                "Save Changes"
              ) : (
                "Create Set"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setPendingDeleteSetId(null);
          setPendingDeleteSetTitle(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Set</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the service set{" "}
              <span className="font-semibold">{pendingDeleteSetTitle}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteSetId(null);
                setPendingDeleteSetTitle(null);
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
                  Delete Service Set
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
